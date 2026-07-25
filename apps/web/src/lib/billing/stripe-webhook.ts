// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from '@cairn/core/billing'
import type Stripe from 'stripe'
import { creditLedger, db, stripeEvents, subscriptions } from '@cairn/db'
import { sql } from 'drizzle-orm'
import { getIndividualSubscriptionPriceId, getStripeClient, stripeId } from './stripe'
import { resolveSubscriptionGrantQuantity } from './subscription-grant'
import { asStripeSubscriptionRecord, type StripeSubscriptionRecord } from './stripe-subscription'

type StripeInvoiceRecord = {
  id: string
  billingReason: string | null
  subscriptionId: string | null
  invoiceQuantity: number | null
}

export interface CreditPackFulfillment {
  workspaceId: string
  supporterUserId: string
  checkoutSessionId: string
}

export function resolveCreditPackFulfillment(
  session: Stripe.Checkout.Session,
): CreditPackFulfillment | null {
  if (session.metadata?.['purchaseType'] !== 'credit_pack' || session.payment_status !== 'paid') {
    return null
  }
  const workspaceId = session.metadata['workspaceId']
  const supporterUserId = session.metadata['supporterUserId']
  if (!workspaceId || !supporterUserId) {
    throw new Error(`Credit pack Checkout ${session.id} is missing billing metadata`)
  }
  return { workspaceId, supporterUserId, checkoutSessionId: session.id }
}

function toSubscriptionStatus(status: string): 'active' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid') return 'past_due'
  return 'canceled'
}

async function asInvoiceRecord(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<StripeInvoiceRecord> {
  const value = invoice as unknown as {
    id: string
    billing_reason?: string | null
    subscription?: string | { id: string } | null
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null } | null
    } | null
  }
  const billingReason = value.billing_reason ?? null
  let invoiceQuantity: number | null = null
  if (billingReason === 'subscription_create' || billingReason === 'subscription_cycle') {
    const subscriptionPriceId = getIndividualSubscriptionPriceId()
    const lines: Array<{ quantity?: number | null; priceId?: string | null }> = []
    // invoice.lines は先頭ページだけの場合があるため、Stripe のページングを最後まで辿る。
    for await (const line of stripe.invoices.listLineItems(value.id, { limit: 100 })) {
      lines.push({
        quantity: line.quantity,
        priceId: stripeId(line.pricing?.price_details?.price),
      })
    }
    invoiceQuantity = resolveSubscriptionGrantQuantity(billingReason, lines, subscriptionPriceId)
  }

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
  let invoiceId: string | null = null
  let invoiceQuantity: number | null = null
  let subscriptionId: string | null = null
  let creditPackFulfillment: CreditPackFulfillment | null = null

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    subscriptionId = stripeId(session.subscription)
    creditPackFulfillment = resolveCreditPackFulfillment(session)
  }
  if (event.type === 'invoice.paid') {
    const invoice = await asInvoiceRecord(stripe, event.data.object as Stripe.Invoice)
    subscriptionId = invoice.subscriptionId
    invoiceId = invoice.id
    invoiceQuantity = invoice.invoiceQuantity
  }
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const eventSubscription = event.data.object as Stripe.Subscription
    // 順不同で届く payload ではなく、Stripe 側の最新状態を正として同期する。
    subscriptionId = eventSubscription.id
  }

  return db.transaction(async (tx) => {
    const [processed] = await tx
      .insert(stripeEvents)
      .values({ eventId: event.id })
      .onConflictDoNothing()
      .returning({ eventId: stripeEvents.eventId })
    if (!processed) return { duplicate: true }

    let subscription: StripeSubscriptionRecord | null = null
    if (subscriptionId) {
      // 取得と upsert を同じ購読単位で直列化し、後着した古いスナップショットが
      // Stripe の最新状態を上書きしないようにする。
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`stripe-subscription:${subscriptionId}`}, 0))`,
      )
      subscription = asStripeSubscriptionRecord(await stripe.subscriptions.retrieve(subscriptionId))
    }
    if (subscription) await syncSubscription(tx, subscription)
    if (creditPackFulfillment) {
      await tx
        .insert(creditLedger)
        .values({
          workspaceId: creditPackFulfillment.workspaceId,
          delta: BILLING_CONFIG.creditPackCredits,
          reason: 'pack_purchase',
          refId: creditPackFulfillment.checkoutSessionId,
        })
        .onConflictDoNothing()
    }
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
