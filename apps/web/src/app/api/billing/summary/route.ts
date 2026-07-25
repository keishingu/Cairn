// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveWorkspaceState } from '@cairn/core/billing'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'

export interface BillingSummaryDto {
  billingEnabled: boolean
  creditBalance: number
  workspaceState: 'unlimited' | 'funded' | 'weathered'
  originalBytes: number
  derivedBytes: number
  hasManageableSubscription: boolean
}

export async function GET() {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  const forbidden = requireRole(ctx.role, 'member')
  if (forbidden) return forbidden

  const billingEnabled = isBillingEnabled()
  if (!billingEnabled) {
    return NextResponse.json({
      billingEnabled: false,
      creditBalance: 0,
      workspaceState: resolveWorkspaceState(0, false),
      originalBytes: 0,
      derivedBytes: 0,
      hasManageableSubscription: false,
    } satisfies BillingSummaryDto)
  }

  try {
    const { creditLedger, db, subscriptions, workspaceStorageUsage } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')
    const [[balance], [usage], [subscription]] = await Promise.all([
      db
        .select({ value: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
        .from(creditLedger)
        .where(eq(creditLedger.workspaceId, ctx.workspaceId)),
      db
        .select({
          originalBytes: workspaceStorageUsage.originalBytes,
          derivedBytes: workspaceStorageUsage.derivedBytes,
        })
        .from(workspaceStorageUsage)
        .where(eq(workspaceStorageUsage.workspaceId, ctx.workspaceId))
        .limit(1),
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, ctx.workspaceId),
            eq(subscriptions.supporterUserId, ctx.userId),
            eq(subscriptions.plan, 'individual'),
            inArray(subscriptions.status, ['active', 'past_due']),
          ),
        )
        .limit(1),
    ])
    const creditBalance = Number(balance?.value ?? 0)
    return NextResponse.json({
      billingEnabled: true,
      creditBalance,
      workspaceState: resolveWorkspaceState(creditBalance, true),
      originalBytes: usage?.originalBytes ?? 0,
      derivedBytes: usage?.derivedBytes ?? 0,
      hasManageableSubscription: subscription !== undefined,
    } satisfies BillingSummaryDto)
  } catch (err) {
    console.error('[/api/billing/summary GET]', err)
    return NextResponse.json({ error: '請求情報の取得に失敗しました' }, { status: 500 })
  }
}
