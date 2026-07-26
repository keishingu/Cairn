// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceRole, isWorkspaceOwner } from '@/lib/access/membership'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import {
  getIndividualSubscriptionPriceId,
  getWorkspaceSubscriptionPriceId,
  getStripeClient,
  resolveApplicationUrl,
} from '@/lib/billing/stripe'

interface CheckoutBody {
  quantity?: unknown
  plan?: unknown
}

export async function POST(request: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }

  let body: CheckoutBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }
  const plan = body.plan === 'workspace' ? 'workspace' : 'individual'
  const quantity = plan === 'workspace' ? 1 : (body.quantity === undefined ? 1 : body.quantity)
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 20
  ) {
    return NextResponse.json({ error: '口数は1から20で指定してください' }, { status: 400 })
  }

  // ctx は active membership を経由しているが、課金の支援者判定も同じ契約を明示する。
  const role = await getWorkspaceRole(ctx.workspaceId, ctx.userId)
  if (!role)
    return NextResponse.json({ error: 'ワークスペースへのアクセス権がありません' }, { status: 403 })
  if (plan === 'workspace' && !isWorkspaceOwner(role)) {
    return NextResponse.json({ error: 'Teamプランの契約にはオーナー権限が必要です' }, { status: 403 })
  }

  try {
    const { billingCustomers, db, subscriptions } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')
    const stripe = getStripeClient()
    const [existingCustomer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, ctx.userId))
      .limit(1)
    let customerId = existingCustomer?.stripeCustomerId
    if (!customerId) {
      const createdCustomer = await stripe.customers.create({
        metadata: { userId: ctx.userId },
      })
      const [insertedCustomer] = await db
        .insert(billingCustomers)
        .values({ userId: ctx.userId, stripeCustomerId: createdCustomer.id })
        .onConflictDoNothing()
        .returning({ stripeCustomerId: billingCustomers.stripeCustomerId })
      if (insertedCustomer) {
        customerId = insertedCustomer.stripeCustomerId
      } else {
        const [persistedCustomer] = await db
          .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
          .from(billingCustomers)
          .where(eq(billingCustomers.userId, ctx.userId))
          .limit(1)
        if (!persistedCustomer) throw new Error('Stripe customer was not persisted')
        customerId = persistedCustomer.stripeCustomerId
      }
    }

    const checkout = await db.transaction(async (tx) => {
      // Webhook 到着前には subscriptions に行がないため、同じ支援者・ワークスペースの
      // Checkout 作成を直列化し、Stripe 上の未完了セッションも確認する。
      const lockKey = `checkout:${ctx.workspaceId}:${plan === 'workspace' ? 'workspace' : ctx.userId}:${plan}`
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)

      const [existingSubscription] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, ctx.workspaceId),
            eq(subscriptions.plan, plan),
            ...(plan === 'workspace' ? [] : [eq(subscriptions.supporterUserId, ctx.userId)]),
            inArray(subscriptions.status, ['active', 'past_due']),
          ),
        )
        .limit(1)
      if (existingSubscription) return { error: '既存の購読は請求管理画面から変更してください' }

      const openSessions = await stripe.checkout.sessions.list({
        customer: customerId,
        status: 'open',
        limit: 100,
      })
      const openSession = openSessions.data.find(
        (session) =>
          session.metadata?.['workspaceId'] === ctx.workspaceId &&
          session.metadata?.['supporterUserId'] === ctx.userId &&
          session.metadata?.['plan'] === plan,
      )
      if (openSession?.url) return { url: openSession.url }
      if (openSession) return { error: '決済画面の準備中です。少し待ってから再試行してください' }

      // Checkout が complete になった直後は、Webhook が subscriptions を同期する前でも
      // Stripe 側には購読が存在する。この間に2件目の Checkout を作らない。
      const stripeSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      })
      const pendingSubscription = stripeSubscriptions.data.find(
        (subscription) =>
          subscription.metadata?.['workspaceId'] === ctx.workspaceId &&
          subscription.metadata?.['supporterUserId'] === ctx.userId &&
          subscription.metadata?.['plan'] === plan &&
          subscription.status !== 'canceled' &&
          subscription.status !== 'incomplete_expired',
      )
      if (pendingSubscription) {
        return { error: '既存の購読を処理中です。少し待ってから請求管理画面を確認してください' }
      }

      const appUrl = resolveApplicationUrl(request)
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: ctx.userId,
        line_items: [{ price: plan === 'workspace' ? getWorkspaceSubscriptionPriceId() : getIndividualSubscriptionPriceId(), quantity }],
        success_url: `${appUrl}/settings/billing?checkout=success`,
        cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
        metadata: { workspaceId: ctx.workspaceId, supporterUserId: ctx.userId, plan },
        subscription_data: {
          metadata: { workspaceId: ctx.workspaceId, supporterUserId: ctx.userId, plan },
        },
      })
      if (!session.url) throw new Error('Stripe Checkout session did not include a URL')
      return { url: session.url }
    })
    if ('error' in checkout) return NextResponse.json({ error: checkout.error }, { status: 409 })
    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[/api/billing/checkout POST]', err)
    return NextResponse.json({ error: '決済画面の準備に失敗しました' }, { status: 500 })
  }
}
