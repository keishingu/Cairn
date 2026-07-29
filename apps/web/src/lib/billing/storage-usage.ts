// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, files, workspaceStorageUsage, workspaces } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'
import { isBillingEnabled } from './is-billing-enabled'
import {
  advanceWorkspaceStorageRentCursor,
  settleWorkspaceStorageRent,
  type StorageRentTransaction,
} from './storage-rent'

export interface StorageUsage {
  originalBytes: number
  derivedBytes: number
}

export interface StorageUsageReconciliation extends StorageUsage {
  workspaceId: string
  originalBytesDrift: number
  derivedBytesDrift: number
}

type StorageUsageExecutor = StorageRentTransaction

/**
 * 通常のアップロード・削除で使用量カウンタを更新する。
 * プロジェクト削除などの CASCADE 経路では呼ばれないため、日次 reconciliation が必須。
 */
export async function recordStorageUsageDelta(
  workspaceId: string,
  delta: StorageUsage,
  executor: StorageUsageExecutor | typeof db = db,
): Promise<void> {
  if (delta.originalBytes === 0 && delta.derivedBytes === 0) return

  // 使用量変更の直前までを古い使用量で精算してから新しい使用量を反映する。
  // これにより cron 間に増減した容量を遡って請求しない。
  if (executor === db) {
    await db.transaction(tx => recordStorageUsageDelta(workspaceId, delta, tx))
    return
  }

  const tx = executor as StorageUsageExecutor
  const now = new Date()
  if (isBillingEnabled()) {
    await settleWorkspaceStorageRent(tx, workspaceId, now)
  } else {
    // 課金無効期間の容量変化を、後で有効化した時点から遡って請求しない。
    await advanceWorkspaceStorageRentCursor(tx, workspaceId, now)
  }
  await tx
    .insert(workspaceStorageUsage)
    .values({
      workspaceId,
      // 行がまだ無い場合の削除は0へ丸める。次回 reconciliation が実値を復元する。
      originalBytes: Math.max(0, delta.originalBytes),
      derivedBytes: Math.max(0, delta.derivedBytes),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspaceStorageUsage.workspaceId,
      set: {
        originalBytes: sql<number>`GREATEST(0, ${workspaceStorageUsage.originalBytes} + ${delta.originalBytes})`,
        derivedBytes: sql<number>`GREATEST(0, ${workspaceStorageUsage.derivedBytes} + ${delta.derivedBytes})`,
        updatedAt: now,
      },
    })
}

/**
 * files を正としてワークスペースの使用量を再集計し、カウンタとの差分を修正する。
 */
export async function reconcileWorkspaceStorageUsage(
  workspaceId: string,
): Promise<StorageUsageReconciliation> {
  return db.transaction(async (tx) => {
    // 先に行を確保してロックする。SUM の後でロックすると、その間にコミットした
    // アップロードのカウンタ更新を古い集計値で上書きしてしまう。
    await tx
      .insert(workspaceStorageUsage)
      .values({ workspaceId })
      .onConflictDoNothing()

    const [current] = await tx
      .select({
        originalBytes: workspaceStorageUsage.originalBytes,
        derivedBytes: workspaceStorageUsage.derivedBytes,
      })
      .from(workspaceStorageUsage)
      .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
      .for('update')
      .limit(1)

    const [actual] = await tx
      .select({
        originalBytes: sql<string>`COALESCE(SUM(${files.fileSize}), 0)`,
        derivedBytes: sql<string>`COALESCE(SUM(${files.derivedFileSize}), 0)`,
      })
      .from(files)
      .where(eq(files.workspaceId, workspaceId))

    const originalBytes = Number(actual?.originalBytes ?? 0)
    const derivedBytes = Number(actual?.derivedBytes ?? 0)
    const now = new Date()
    const billingEnabled = isBillingEnabled()
    if (billingEnabled) {
      await settleWorkspaceStorageRent(tx, workspaceId, now)
    }
    await tx
      .insert(workspaceStorageUsage)
      .values({
        workspaceId,
        originalBytes,
        derivedBytes,
        lastReconciledAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workspaceStorageUsage.workspaceId,
        set: {
          originalBytes,
          derivedBytes,
          lastReconciledAt: now,
          updatedAt: now,
          ...(!billingEnabled ? { lastRentAt: now } : {}),
        },
      })

    return {
      workspaceId,
      originalBytes,
      derivedBytes,
      originalBytesDrift: originalBytes - (current?.originalBytes ?? 0),
      derivedBytesDrift: derivedBytes - (current?.derivedBytes ?? 0),
    }
  })
}

/**
 * CASCADE 削除を含む全経路の乖離を日次で修正する。
 */
export async function reconcileAllWorkspaceStorageUsage(): Promise<StorageUsageReconciliation[]> {
  const workspaceRows = await db.select({ id: workspaces.id }).from(workspaces)
  const results: StorageUsageReconciliation[] = []
  for (const workspace of workspaceRows) {
    results.push(await reconcileWorkspaceStorageUsage(workspace.id))
  }
  return results
}
