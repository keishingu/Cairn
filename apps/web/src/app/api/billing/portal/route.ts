// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isWorkspaceOwner } from '@/lib/access/membership'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getStripeClient, resolveApplicationUrl } from '@/lib/billing/stripe'

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }
  // Customer Portalの設定でSolo↔Teamの切替を許可しているため、
  // Teamへ昇格できる経路はownerに統一する。
  if (!isWorkspaceOwner(ctx.role)) {
    return NextResponse.json({ error: '請求管理にはオーナー権限が必要です' }, { status: 403 })
  }

  try {
    const { billingCustomers, db, subscriptions } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')
    let customerUserId = ctx.userId
    let inheritedTeamSubscriptionId: string | null = null
    if (isWorkspaceOwner(ctx.role)) {
      const [workspaceSubscription] = await db
        .select({
          supporterUserId: subscriptions.supporterUserId,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, ctx.workspaceId),
            eq(subscriptions.plan, 'workspace'),
            inArray(subscriptions.status, ['active', 'past_due']),
          ),
        )
        .limit(1)
      if (workspaceSubscription) {
        customerUserId = workspaceSubscription.supporterUserId
        if (customerUserId !== ctx.userId) {
          inheritedTeamSubscriptionId = workspaceSubscription.stripeSubscriptionId
        }
      }
    }
    if (customerUserId === ctx.userId) {
      const [ownSubscription] = await db
        .select({ id: subscriptions.id, plan: subscriptions.plan })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, ctx.workspaceId),
            eq(subscriptions.supporterUserId, ctx.userId),
            inArray(subscriptions.plan, ['individual', 'workspace']),
            inArray(subscriptions.status, ['active', 'past_due']),
          ),
        )
        .limit(1)
      if (!ownSubscription || (ownSubscription.plan === 'workspace' && !isWorkspaceOwner(ctx.role))) {
        return NextResponse.json({ error: '管理できる購読が見つかりません' }, { status: 404 })
      }
    }
    const [customer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, customerUserId))
      .limit(1)
    if (!customer) {
      return NextResponse.json({ error: '管理できる購読が見つかりません' }, { status: 404 })
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${resolveApplicationUrl(request)}/settings/billing`,
      ...(inheritedTeamSubscriptionId
        ? {
            // 継承ownerには購入者Customer全体ではなく、対象Team購読だけを操作させる。
            flow_data: {
              // 請求者が不在の状態でSoloへ変えると購読の管理者が不在になるため、
              // 継承ownerには解約だけを許可する。
              type: 'subscription_cancel' as const,
              subscription_cancel: { subscription: inheritedTeamSubscriptionId },
              after_completion: {
                type: 'redirect' as const,
                redirect: { return_url: `${resolveApplicationUrl(request)}/settings/billing` },
              },
            },
          }
        : {}),
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/portal POST]', err)
    return NextResponse.json({ error: '請求管理画面の準備に失敗しました' }, { status: 500 })
  }
}
