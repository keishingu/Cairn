// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { db, files, workspaceStorageUsage, workspaces } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'

export interface StorageUsage {
  originalBytes: number
  derivedBytes: number
}

export interface StorageUsageReconciliation extends StorageUsage {
  workspaceId: string
  originalBytesDrift: number
  derivedBytesDrift: number
}

type StorageUsageExecutor = Pick<typeof db, 'insert'>

/**
 * 通常のアップロード・削除で使用量カウンタを更新する。
 * プロジェクト削除などの CASCADE 経路では呼ばれないため、日次 reconciliation が必須。
 */
export async function recordStorageUsageDelta(
  workspaceId: string,
  delta: StorageUsage,
  executor: StorageUsageExecutor = db,
): Promise<void> {
  if (delta.originalBytes === 0 && delta.derivedBytes === 0) return

  const now = new Date()
  await executor
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
  const [actual] = await db
    .select({
      originalBytes: sql<string>`COALESCE(SUM(${files.fileSize}), 0)`,
      derivedBytes: sql<string>`COALESCE(SUM(${files.derivedFileSize}), 0)`,
    })
    .from(files)
    .where(eq(files.workspaceId, workspaceId))

  const originalBytes = Number(actual?.originalBytes ?? 0)
  const derivedBytes = Number(actual?.derivedBytes ?? 0)
  const [current] = await db
    .select({
      originalBytes: workspaceStorageUsage.originalBytes,
      derivedBytes: workspaceStorageUsage.derivedBytes,
    })
    .from(workspaceStorageUsage)
    .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
    .limit(1)

  const now = new Date()
  await db
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
      },
    })

  return {
    workspaceId,
    originalBytes,
    derivedBytes,
    originalBytesDrift: originalBytes - (current?.originalBytes ?? 0),
    derivedBytesDrift: derivedBytes - (current?.derivedBytes ?? 0),
  }
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
