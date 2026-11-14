// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { getStripeClient } from '@/lib/billing/stripe'
import { processStripeWebhookEvent } from '@/lib/billing/stripe-webhook'

export async function POST(request: Request) {
  if (!isBillingEnabled()) {
    return NextResponse.json({ error: 'この環境では請求機能を利用できません' }, { status: 404 })
  }
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET']
  const signature = request.headers.get('stripe-signature')
  if (!webhookSecret || !signature) {
    return NextResponse.json({ error: 'Webhook署名を検証できません' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    )
  } catch (err) {
    console.error('[/api/billing/webhook POST] signature verification failed', err)
    return NextResponse.json({ error: 'Webhook署名を検証できません' }, { status: 400 })
  }

  try {
    await processStripeWebhookEvent(event)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[/api/billing/webhook POST] processing failed', err)
    // 2xx 以外を返し、Stripe の自動再試行に委ねる。
    return NextResponse.json({ error: 'Webhookの処理に失敗しました' }, { status: 500 })
  }
}
