// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveWorkspaceState } from '@cairn/core/billing'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { isWorkspaceOwner } from '@/lib/access/membership'

export interface BillingSummaryDto {
  billingEnabled: boolean
  creditBalance: number
  workspaceState: 'unlimited' | 'funded' | 'weathered'
  originalBytes: number
  derivedBytes: number
  hasManageableSubscription: boolean
  hasActiveWorkspaceSubscription: boolean
  manageableSubscriptions: Array<{
    id: string
    plan: 'individual' | 'workspace'
    action: 'update' | 'cancel'
  }>
  paymentMethodSubscriptionId: string | null
  canPurchaseCreditPack: boolean
  creditPackFulfilled: boolean | null
}

export async function GET(request: Request) {
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
      hasActiveWorkspaceSubscription: false,
      manageableSubscriptions: [],
      paymentMethodSubscriptionId: null,
      canPurchaseCreditPack: false,
      creditPackFulfilled: null,
    } satisfies BillingSummaryDto)
  }

  try {
    const { creditLedger, db, subscriptions, workspaceStorageUsage } = await import('@cairn/db')
    const { and, eq, gt, inArray, or, sql } = await import('drizzle-orm')
    const creditPackSessionId = new URL(request.url).searchParams.get('credit_pack_session_id')
    const [
      [balance],
      [usage],
      ownSubscriptions,
      workspaceSubscriptions,
      [creditPackSubscription],
      creditPackFulfillments,
    ] =
      await Promise.all([
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
          .select({
            id: subscriptions.id,
            plan: subscriptions.plan,
            supporterUserId: subscriptions.supporterUserId,
          })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.workspaceId, ctx.workspaceId),
              eq(subscriptions.supporterUserId, ctx.userId),
              inArray(subscriptions.plan, ['individual', 'workspace']),
              inArray(subscriptions.status, ['active', 'past_due']),
            ),
          ),
        db
          .select({
            id: subscriptions.id,
            supporterUserId: subscriptions.supporterUserId,
          })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.workspaceId, ctx.workspaceId),
              eq(subscriptions.plan, 'workspace'),
              inArray(subscriptions.status, ['active', 'past_due']),
            ),
          ),
        db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.workspaceId, ctx.workspaceId),
              eq(subscriptions.status, 'active'),
              gt(subscriptions.currentPeriodEnd, new Date()),
              or(
                and(
                  eq(subscriptions.plan, 'individual'),
                  eq(subscriptions.supporterUserId, ctx.userId),
                ),
                eq(subscriptions.plan, 'workspace'),
              ),
            ),
          )
          .limit(1),
        creditPackSessionId
          ? db
              .select({ id: creditLedger.id })
              .from(creditLedger)
              .where(
                and(
                  eq(creditLedger.workspaceId, ctx.workspaceId),
                  eq(creditLedger.reason, 'pack_purchase'),
                  eq(creditLedger.refId, creditPackSessionId),
                ),
              )
              .limit(1)
          : Promise.resolve([]),
      ])
    const creditBalance = Number(balance?.value ?? 0)
    const manageableSubscriptionMap = new Map<
      string,
      { id: string; plan: 'individual' | 'workspace'; action: 'update' | 'cancel' }
    >()
    const hasOwnIndividualSubscription = ownSubscriptions.some(
      (subscription) => subscription.plan === 'individual',
    )
    for (const subscription of ownSubscriptions) {
      if (subscription.plan === 'individual' || isWorkspaceOwner(ctx.role)) {
        manageableSubscriptionMap.set(subscription.id, {
          id: subscription.id,
          plan: subscription.plan,
          // owner用PortalはSolo / Teamの両方へ変更できる。Teamが既に存在する
          // 状態でSoloを変更すると、二重のTeam契約を作れてしまうため解約だけにする。
          action:
            subscription.plan === 'individual' &&
            isWorkspaceOwner(ctx.role) &&
            workspaceSubscriptions.length > 0
              ? 'cancel'
              : 'update',
        })
      }
    }
    if (isWorkspaceOwner(ctx.role)) {
      for (const subscription of workspaceSubscriptions) {
        manageableSubscriptionMap.set(subscription.id, {
          id: subscription.id,
          plan: 'workspace',
          // 購入者が非活性化したTeamは、後任ownerが解約だけを行える。Soloへの
          // 変更を許すと、非活性の購入者に紐付いたSolo購読が管理不能になる。
          action:
            subscription.supporterUserId === ctx.userId && !hasOwnIndividualSubscription
              ? 'update'
              : 'cancel',
        })
      }
    }
    const manageableSubscriptions = [...manageableSubscriptionMap.values()]
    return NextResponse.json({
      billingEnabled: true,
      creditBalance,
      workspaceState: resolveWorkspaceState(creditBalance, true),
      originalBytes: usage?.originalBytes ?? 0,
      derivedBytes: usage?.derivedBytes ?? 0,
      hasManageableSubscription: manageableSubscriptions.length > 0,
      hasActiveWorkspaceSubscription: workspaceSubscriptions.length > 0,
      manageableSubscriptions,
      paymentMethodSubscriptionId: ownSubscriptions[0]?.id ?? null,
      canPurchaseCreditPack: creditPackSubscription !== undefined,
      creditPackFulfilled: creditPackSessionId ? creditPackFulfillments.length > 0 : null,
    } satisfies BillingSummaryDto)
  } catch (err) {
    console.error('[/api/billing/summary GET]', err)
    return NextResponse.json({ error: '請求情報の取得に失敗しました' }, { status: 500 })
  }
}
