// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from '@cairn/core/billing'
import type Stripe from 'stripe'
import { creditLedger, db, stripeEvents, subscriptions } from '@cairn/db'
import { getStripeClient, stripeId } from './stripe'
import { resolveSubscriptionGrantQuantity } from './subscription-grant'
import { asStripeSubscriptionRecord, type StripeSubscriptionRecord } from './stripe-subscription'

type StripeInvoiceRecord = {
  id: string
  billingReason: string | null
  subscriptionId: string | null
  invoiceQuantity: number | null
}

function toSubscriptionStatus(status: string): 'active' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid') return 'past_due'
  return 'canceled'
}

function asInvoiceRecord(invoice: Stripe.Invoice): StripeInvoiceRecord {
  const value = invoice as unknown as {
    id: string
    billing_reason?: string | null
    subscription?: string | { id: string } | null
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null } | null
    } | null
    lines?: { data?: Array<{ quantity?: number | null }> }
  }
  const billingReason = value.billing_reason ?? null
  const invoiceQuantity = resolveSubscriptionGrantQuantity(billingReason, value.lines?.data)

  return {
    id: value.id,
    billingReason,
    subscriptionId:
      stripeId(value.subscription) ?? stripeId(value.parent?.subscription_details?.subscription),
    invoiceQuantity,
  }
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
  let invoiceQuantity: number | null = null

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const subscriptionId = stripeId(session.subscription)
    if (subscriptionId)
      subscription = asStripeSubscriptionRecord(await stripe.subscriptions.retrieve(subscriptionId))
  }
  if (event.type === 'invoice.paid') {
    const invoice = asInvoiceRecord(event.data.object as Stripe.Invoice)
    const subscriptionId = invoice.subscriptionId
    if (subscriptionId)
      subscription = asStripeSubscriptionRecord(await stripe.subscriptions.retrieve(subscriptionId))
    invoiceId = invoice.id
    invoiceQuantity = invoice.invoiceQuantity
  }
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const eventSubscription = event.data.object as Stripe.Subscription
    // 順不同で届く payload ではなく、Stripe 側の最新状態を正として同期する。
    subscription = asStripeSubscriptionRecord(await stripe.subscriptions.retrieve(eventSubscription.id))
  }

  return db.transaction(async (tx) => {
    const [processed] = await tx
      .insert(stripeEvents)
      .values({ eventId: event.id })
      .onConflictDoNothing()
      .returning({ eventId: stripeEvents.eventId })
    if (!processed) return { duplicate: true }

    if (subscription) await syncSubscription(tx, subscription)
    if (event.type === 'invoice.paid' && subscription && invoiceId && invoiceQuantity) {
      const workspaceId = subscription.metadata['workspaceId']
      if (!workspaceId)
        throw new Error(`Invoice ${invoiceId} subscription has no workspace metadata`)
      await tx
        .insert(creditLedger)
        .values({
          workspaceId,
          delta: BILLING_CONFIG.monthlyCreditGrant * invoiceQuantity,
          reason: 'subscription_grant',
          refId: invoiceId,
        })
        .onConflictDoNothing()
    }
    return { duplicate: false }
  })
}
