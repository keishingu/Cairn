// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isWorkspaceOwner } from '@/lib/access/membership'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import {
  getMemberBillingPortalConfigurationId,
  getOwnerBillingPortalConfigurationId,
  getStripeClient,
  resolveApplicationUrl,
} from '@/lib/billing/stripe'

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }

  try {
    const { billingCustomers, db, subscriptions } = await import('@cairn/db')
    const { and, eq, inArray } = await import('drizzle-orm')
    const body = (await request.json().catch(() => null)) as { subscriptionId?: unknown } | null
    const subscriptionId = body?.subscriptionId
    if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
      return NextResponse.json({ error: '管理する購読を指定してください' }, { status: 400 })
    }

    const [subscription] = await db
      .select({
        supporterUserId: subscriptions.supporterUserId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        plan: subscriptions.plan,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.workspaceId, ctx.workspaceId),
          inArray(subscriptions.status, ['active', 'past_due']),
        ),
      )
      .limit(1)
    if (!subscription) {
      return NextResponse.json({ error: '管理できる購読が見つかりません' }, { status: 404 })
    }
    if (subscription.plan === 'workspace' && !isWorkspaceOwner(ctx.role)) {
      return NextResponse.json({ error: 'Teamプランの管理にはオーナー権限が必要です' }, { status: 403 })
    }
    if (subscription.plan === 'individual' && subscription.supporterUserId !== ctx.userId) {
      return NextResponse.json({ error: 'このSoloプランを管理する権限がありません' }, { status: 403 })
    }

    const [conflictingSubscription] = isWorkspaceOwner(ctx.role)
      ? await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            subscription.plan === 'individual'
              ? and(
                  eq(subscriptions.workspaceId, ctx.workspaceId),
                  eq(subscriptions.plan, 'workspace'),
                  inArray(subscriptions.status, ['active', 'past_due']),
                )
              : and(
                  eq(subscriptions.workspaceId, ctx.workspaceId),
                  eq(subscriptions.plan, 'individual'),
                  eq(subscriptions.supporterUserId, subscription.supporterUserId),
                  inArray(subscriptions.status, ['active', 'past_due']),
                ),
          )
          .limit(1)
      : []
    const [customer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, subscription.supporterUserId))
      .limit(1)
    if (!customer) {
      return NextResponse.json({ error: '管理できる購読が見つかりません' }, { status: 404 })
    }

    // Customerは複数ワークスペースの購読を持ち得るため、Customer全体のPortalを開かない。
    // このワークスペースで選択したsubscriptionだけを更新する。member用Configurationは
    // Solo Priceだけを許可し、Teamへ変更できるのはowner用Configurationだけにする。
    const isInheritedWorkspaceSubscription =
      subscription.plan === 'workspace' && subscription.supporterUserId !== ctx.userId
    const isCancellationOnly = isInheritedWorkspaceSubscription || conflictingSubscription !== undefined
    const returnUrl = `${resolveApplicationUrl(request)}/settings/billing`
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: returnUrl,
      configuration: isWorkspaceOwner(ctx.role)
        ? getOwnerBillingPortalConfigurationId()
        : getMemberBillingPortalConfigurationId(),
      flow_data: isCancellationOnly
        ? {
            // 購入者が非活性化したTeamをSoloへ変更すると、購入者に紐付いたSoloが
            // 誰からも管理できなくなる。後任ownerには解約だけを許可する。
            type: 'subscription_cancel',
            subscription_cancel: { subscription: subscription.stripeSubscriptionId },
            after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
          }
        : {
            type: 'subscription_update',
            subscription_update: { subscription: subscription.stripeSubscriptionId },
            after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
          },
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/portal POST]', err)
    return NextResponse.json({ error: '請求管理画面の準備に失敗しました' }, { status: 500 })
  }
}
