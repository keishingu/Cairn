// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { calculateStorageRentAccrual, settleStorageRent } from '@cairn/core/billing'
import { creditLedger, db, workspaceStorageUsage } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'
import { lockWorkspaceCreditBalance } from './credits'

export interface StorageRentChargeResult {
  workspaceId: string
  debitedCredits: number
}

export type StorageRentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * 最終記帳時点から現在までの家賃を、日割り・JST月境界で台帳へ記帳する。
 * 使用量行をロックするため、cron の再試行・重複実行でも同じ期間を二重請求しない。
 */
export async function settleWorkspaceStorageRent(
  tx: StorageRentTransaction,
  workspaceId: string,
  now = new Date(),
): Promise<StorageRentChargeResult> {
  const [usage] = await tx
    .select({
      originalBytes: workspaceStorageUsage.originalBytes,
      unbilledRentCredits: workspaceStorageUsage.unbilledRentCredits,
      lastRentAt: workspaceStorageUsage.lastRentAt,
    })
    .from(workspaceStorageUsage)
    .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
    .for('update')
    .limit(1)

  if (!usage || now <= usage.lastRentAt) {
    return { workspaceId, debitedCredits: 0 }
  }

  await lockWorkspaceCreditBalance(tx, workspaceId)

  const [balanceRow] = await tx
    .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
  const availableCredits = Math.max(0, Number(balanceRow?.balance ?? 0))
  if (availableCredits <= 0) {
    await tx
      .update(workspaceStorageUsage)
      .set({ unbilledRentCredits: '0', lastRentAt: now, updatedAt: now })
      .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
    return { workspaceId, debitedCredits: 0 }
  }

  const accruedCredits = calculateStorageRentAccrual(usage.originalBytes, usage.lastRentAt, now)
  const settlement = settleStorageRent(accruedCredits, Number(usage.unbilledRentCredits))
  const refId = `${usage.lastRentAt.toISOString()}:${now.toISOString()}`

  const debitCredits = Math.min(settlement.debitCredits, availableCredits)
  if (debitCredits > 0) {
    await tx
      .insert(creditLedger)
      .values({
        workspaceId,
        delta: -debitCredits,
        reason: 'storage_rent',
        refId,
      })
      .onConflictDoNothing()
  }

  await tx
    .update(workspaceStorageUsage)
    .set({
      // 残高を使い切った時点で風化へ移行する。未払い家賃を持ち越して後の付与を
      // 遡及消費しないよう、端数もここで破棄する。
      unbilledRentCredits:
        debitCredits < settlement.debitCredits ? '0' : String(settlement.remainingCredits),
      lastRentAt: now,
      updatedAt: now,
    })
    .where(eq(workspaceStorageUsage.workspaceId, workspaceId))

  return { workspaceId, debitedCredits: debitCredits }
}

export async function chargeWorkspaceStorageRent(
  workspaceId: string,
  now = new Date(),
): Promise<StorageRentChargeResult> {
  return db.transaction((tx) => settleWorkspaceStorageRent(tx, workspaceId, now))
}

export async function advanceWorkspaceStorageRentCursor(
  tx: StorageRentTransaction,
  workspaceId: string,
  now = new Date(),
): Promise<void> {
  const [usage] = await tx
    .select({ lastRentAt: workspaceStorageUsage.lastRentAt })
    .from(workspaceStorageUsage)
    .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
    .for('update')
    .limit(1)
  if (!usage || now <= usage.lastRentAt) return

  await tx
    .update(workspaceStorageUsage)
    .set({ lastRentAt: now, updatedAt: now })
    .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
}

export async function chargeAllWorkspaceStorageRent(
  now = new Date(),
): Promise<StorageRentChargeResult[]> {
  const rows = await db
    .select({ workspaceId: workspaceStorageUsage.workspaceId })
    .from(workspaceStorageUsage)

  const results: StorageRentChargeResult[] = []
  for (const row of rows) {
    results.push(await chargeWorkspaceStorageRent(row.workspaceId, now))
  }
  return results
}

export async function advanceAllWorkspaceStorageRentCursors(now = new Date()): Promise<number> {
  const rows = await db
    .select({ workspaceId: workspaceStorageUsage.workspaceId })
    .from(workspaceStorageUsage)

  for (const row of rows) {
    await db.transaction((tx) => advanceWorkspaceStorageRentCursor(tx, row.workspaceId, now))
  }
  return rows.length
}
