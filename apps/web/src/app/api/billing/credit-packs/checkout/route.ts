// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { BILLING_CONFIG } from '@cairn/core/billing'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceRole } from '@/lib/access/membership'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getCreditPackPriceId, getStripeClient, resolveApplicationUrl } from '@/lib/billing/stripe'
import { isConfiguredCreditPackPrice, isReusableCreditPackCheckout } from './credit-pack-checkout'
import { runForActiveMembership } from '@/lib/access/active-membership-lock'

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }

  const role = await getWorkspaceRole(ctx.workspaceId, ctx.userId)
  if (!role) {
    return NextResponse.json({ error: 'ワークスペースへのアクセス権がありません' }, { status: 403 })
  }

  try {
    const { billingCustomers, db, subscriptions } = await import('@cairn/db')
    const { and, eq, gt, sql } = await import('drizzle-orm')
    const stripe = getStripeClient()
    const checkout = await runForActiveMembership(db, ctx.workspaceId, ctx.userId, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${ctx.workspaceId}:${ctx.userId}:credit-pack`}, 0))`,
      )
      const [existingCustomer] = await tx
        .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
        .from(billingCustomers)
        .where(eq(billingCustomers.userId, ctx.userId))
        .limit(1)
      let customerId = existingCustomer?.stripeCustomerId
      if (!customerId) {
        const createdCustomer = await stripe.customers.create({
          metadata: { userId: ctx.userId },
        })
        const [insertedCustomer] = await tx
          .insert(billingCustomers)
          .values({ userId: ctx.userId, stripeCustomerId: createdCustomer.id })
          .onConflictDoNothing()
          .returning({ stripeCustomerId: billingCustomers.stripeCustomerId })
        if (insertedCustomer) {
          customerId = insertedCustomer.stripeCustomerId
        } else {
          const [persistedCustomer] = await tx
            .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
            .from(billingCustomers)
            .where(eq(billingCustomers.userId, ctx.userId))
            .limit(1)
          if (!persistedCustomer) throw new Error('Stripe customer was not persisted')
          customerId = persistedCustomer.stripeCustomerId
        }
      }

      const [activeSubscription] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, ctx.workspaceId),
            eq(subscriptions.supporterUserId, ctx.userId),
            eq(subscriptions.plan, 'individual'),
            eq(subscriptions.status, 'active'),
            gt(subscriptions.currentPeriodEnd, new Date()),
          ),
        )
        .limit(1)
      if (!activeSubscription) {
        return { error: 'クレジットの追加は、石を積んでいるメンバーのみ利用できます' }
      }

      const creditPackPriceId = getCreditPackPriceId()
      const openSessions = await stripe.checkout.sessions.list({
        customer: customerId,
        status: 'open',
        limit: 100,
      })
      const relevantOpenSessions = openSessions.data.filter(
        (session) =>
          session.metadata?.['workspaceId'] === ctx.workspaceId &&
          session.metadata?.['supporterUserId'] === ctx.userId &&
          session.metadata?.['purchaseType'] === 'credit_pack',
      )
      const reusableSession = relevantOpenSessions.find((session) =>
        isReusableCreditPackCheckout(session, {
          workspaceId: ctx.workspaceId,
          supporterUserId: ctx.userId,
          priceId: creditPackPriceId,
        }),
      )
      if (reusableSession?.url) return { url: reusableSession.url }
      if (reusableSession) return { error: '決済画面の準備中です。少し待ってから再試行してください' }

      // 旧実装が作成した不完全なセッションを再利用すると、Webhook が決済内容を検証できず、
      // 支払い済みでもクレジットを付与できない。新規作成前に失効させる。
      await Promise.all(relevantOpenSessions.map((session) => stripe.checkout.sessions.expire(session.id)))

      const appUrl = resolveApplicationUrl(request)
      const creditPackPrice = await stripe.prices.retrieve(creditPackPriceId)
      if (!isConfiguredCreditPackPrice(creditPackPrice)) {
        throw new Error(`Configured credit pack Price ${creditPackPriceId} does not match billing config`)
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        client_reference_id: ctx.userId,
        line_items: [{ price: creditPackPriceId, quantity: 1 }],
        success_url: `${appUrl}/settings/billing?credit_pack=success&credit_pack_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/settings/billing?credit_pack=cancel`,
        metadata: {
          workspaceId: ctx.workspaceId,
          supporterUserId: ctx.userId,
          purchaseType: 'credit_pack',
          creditPackCredits: String(BILLING_CONFIG.creditPackCredits),
          creditPackPriceId,
          creditPackAmountJpy: String(BILLING_CONFIG.creditPackPriceJpy),
        },
      })
      if (!session.url) throw new Error('Stripe Checkout session did not include a URL')
      return { url: session.url }
    })
    if (!checkout) {
      return NextResponse.json(
        { error: 'ワークスペースへのアクセス権がありません' },
        { status: 403 },
      )
    }
    if ('error' in checkout) return NextResponse.json({ error: checkout.error }, { status: 403 })
    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[/api/billing/credit-packs/checkout POST]', err)
    return NextResponse.json({ error: '決済画面の準備に失敗しました' }, { status: 500 })
  }
}
