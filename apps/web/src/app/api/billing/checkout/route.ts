// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getWorkspaceRole } from '@/lib/access/membership'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import {
  getIndividualSubscriptionPriceId,
  getStripeClient,
  resolveApplicationUrl,
} from '@/lib/billing/stripe'

interface CheckoutBody {
  quantity?: unknown
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
  const quantity = body.quantity === undefined ? 1 : body.quantity
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

  try {
    const { billingCustomers, db } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const stripe = getStripeClient()
    const [existingCustomer] = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, ctx.userId))
      .limit(1)
    const customerId =
      existingCustomer?.stripeCustomerId ??
      (
        await stripe.customers.create({
          metadata: { userId: ctx.userId },
        })
      ).id

    if (!existingCustomer) {
      await db
        .insert(billingCustomers)
        .values({ userId: ctx.userId, stripeCustomerId: customerId })
        .onConflictDoNothing()
    }

    const appUrl = resolveApplicationUrl(request)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: ctx.userId,
      line_items: [{ price: getIndividualSubscriptionPriceId(), quantity }],
      success_url: `${appUrl}/settings/billing?checkout=success`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
      metadata: { workspaceId: ctx.workspaceId, supporterUserId: ctx.userId, plan: 'individual' },
      subscription_data: {
        metadata: { workspaceId: ctx.workspaceId, supporterUserId: ctx.userId, plan: 'individual' },
      },
    })
    if (!session.url) throw new Error('Stripe Checkout session did not include a URL')
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/checkout POST]', err)
    return NextResponse.json({ error: '決済画面の準備に失敗しました' }, { status: 500 })
  }
}
