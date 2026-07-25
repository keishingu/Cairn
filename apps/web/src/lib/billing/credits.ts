// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { creditLedger, db } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'
import { isBillingEnabled } from './is-billing-enabled'

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

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

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credit-consumption:${workspaceId}`}, 0))`,
  )
  const [row] = await tx
    .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.workspaceId, workspaceId))
  if (Number(row?.balance ?? 0) <= 0) return false

  await tx
    .insert(creditLedger)
    .values({ workspaceId, delta: -credits, reason: 'ai_consumption', refId })
    .onConflictDoNothing()
  return true
}
