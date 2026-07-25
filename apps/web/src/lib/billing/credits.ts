// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { creditLedger, db } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'
import { isBillingEnabled } from './is-billing-enabled'

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function lockWorkspaceCreditBalance(tx: BillingTransaction, workspaceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credit-consumption:${workspaceId}`}, 0))`,
  )
}

export function sortWorkspaceCreditLockIds(workspaceIds: string[]): string[] {
  return [...new Set(workspaceIds)].sort((a, b) => a.localeCompare(b))
}

// 複数ワークスペースを一つのトランザクションで配信するHeartbeatは、候補順ではなく
// 安定した順番で全残高ロックを先取りする。Phase間の逆順待ちによるデッドロックを防ぐ。
export async function lockWorkspaceCreditBalances(
  tx: BillingTransaction,
  workspaceIds: string[],
) {
  if (!isBillingEnabled()) return
  for (const workspaceId of sortWorkspaceCreditLockIds(workspaceIds)) {
    await lockWorkspaceCreditBalance(tx, workspaceId)
  }
}

export async function getWorkspaceCreditBalance(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))

  return Number(row?.balance ?? 0)
}

/**
 * 受動的なAI配信の直前に、残高を直列化して消費する。
 * 課金無効のセルフホストでは記帳せず常に許可する。
 */
export async function consumeCreditsForPassiveBenefit(
  tx: BillingTransaction,
  { workspaceId, credits, refId }: { workspaceId: string; credits: number; refId: string },
): Promise<boolean> {
  if (!isBillingEnabled()) return true

  await lockWorkspaceCreditBalance(tx, workspaceId)
  const [row] = await tx
    .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
  if (Number(row?.balance ?? 0) < credits) return false

  await tx
    .insert(creditLedger)
    .values({ workspaceId, delta: -credits, reason: 'ai_consumption', refId })
    .onConflictDoNothing()
  return true
}

export async function reserveCreditsForActiveBenefit(
  workspaceId: string,
  credits: number,
  refId: string,
): Promise<boolean> {
  if (!isBillingEnabled()) return true
  return db.transaction(async (tx) => {
    await lockWorkspaceCreditBalance(tx, workspaceId)
    const [row] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, workspaceId))
    if (Number(row?.balance ?? 0) < credits) return false
    await tx.insert(creditLedger).values({ workspaceId, delta: -credits, reason: 'ai_consumption', refId })
    return true
  })
}

export async function refundActiveBenefitReservation(workspaceId: string, credits: number, refId: string) {
  if (!isBillingEnabled()) return
  await db
    .insert(creditLedger)
    .values({ workspaceId, delta: credits, reason: 'adjustment', refId: `refund:${refId}` })
    .onConflictDoNothing()
}
