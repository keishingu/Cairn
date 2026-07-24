// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from '@cairn/core/billing'
import type Stripe from 'stripe'
import { creditLedger, db, stripeEvents, subscriptions } from '@cairn/db'
import { getStripeClient, stripeId } from './stripe'

type StripeSubscriptionRecord = {
  id: string
  status: string
  quantity: number
  currentPeriodEnd: number
  metadata: Record<string, string>
}

function asSubscriptionRecord(subscription: Stripe.Subscription): StripeSubscriptionRecord {
  const value = subscription as unknown as {
    id: string
    status: string
    items: { data: Array<{ quantity: number | null }> }
    current_period_end: number
    metadata: Record<string, string>
  }
  return {
    id: value.id,
    status: value.status,
    quantity: value.items.data[0]?.quantity ?? 1,
    currentPeriodEnd: value.current_period_end,
    metadata: value.metadata,
  }
}

function toSubscriptionStatus(status: string): 'active' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid') return 'past_due'
  return 'canceled'
}

async function syncSubscription(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  subscription: StripeSubscriptionRecord,
) {
  const workspaceId = subscription.metadata['workspaceId']
  const supporterUserId = subscription.metadata['supporterUserId']
  if (!workspaceId || !supporterUserId || subscription.metadata['plan'] !== 'individual') {
    throw new Error(`Subscription ${subscription.id} is missing billing metadata`)
  }

  await tx
    .insert(subscriptions)
    .values({
      workspaceId,
      supporterUserId,
      plan: 'individual',
      stripeSubscriptionId: subscription.id,
      quantity: subscription.quantity,
      status: toSubscriptionStatus(subscription.status),
      currentPeriodEnd: new Date(subscription.currentPeriodEnd * 1000),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        quantity: subscription.quantity,
        status: toSubscriptionStatus(subscription.status),
        currentPeriodEnd: new Date(subscription.currentPeriodEnd * 1000),
        updatedAt: new Date(),
      },
    })
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ duplicate: boolean }> {
  const stripe = getStripeClient()
  let subscription: StripeSubscriptionRecord | null = null
  let invoiceId: string | null = null

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const subscriptionId = stripeId(session.subscription)
    if (subscriptionId)
      subscription = asSubscriptionRecord(await stripe.subscriptions.retrieve(subscriptionId))
  }
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const value = invoice as unknown as {
      id: string
      subscription?: string | { id: string } | null
      parent?: {
        subscription_details?: { subscription?: string | { id: string } | null } | null
      } | null
    }
    const subscriptionId =
      stripeId(value.subscription) ?? stripeId(value.parent?.subscription_details?.subscription)
    if (subscriptionId)
      subscription = asSubscriptionRecord(await stripe.subscriptions.retrieve(subscriptionId))
    invoiceId = value.id
  }
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    subscription = asSubscriptionRecord(event.data.object as Stripe.Subscription)
  }

  return db.transaction(async (tx) => {
    const [processed] = await tx
      .insert(stripeEvents)
      .values({ eventId: event.id })
      .onConflictDoNothing()
      .returning({ eventId: stripeEvents.eventId })
    if (!processed) return { duplicate: true }

    if (subscription) await syncSubscription(tx, subscription)
    if (event.type === 'invoice.paid' && subscription && invoiceId) {
      const workspaceId = subscription.metadata['workspaceId']
      if (!workspaceId)
        throw new Error(`Invoice ${invoiceId} subscription has no workspace metadata`)
      await tx
        .insert(creditLedger)
        .values({
          workspaceId,
          delta: BILLING_CONFIG.monthlyCreditGrant * subscription.quantity,
          reason: 'subscription_grant',
          refId: invoiceId,
        })
        .onConflictDoNothing()
    }
    return { duplicate: false }
  })
}
