// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from '@cairn/core/billing'
import type Stripe from 'stripe'
import { activeWorkspaceMembers, creditLedger, db, stripeEvents, subscriptions } from '@cairn/db'
import { eq, sql } from 'drizzle-orm'
import { getIndividualSubscriptionPriceId, getStripeClient, getWorkspaceSubscriptionPriceId, stripeId } from './stripe'
import {
  resolveSubscriptionGrantQuantity,
  type SubscriptionInvoiceLine,
} from './subscription-grant'
import { asStripeSubscriptionRecord, type StripeSubscriptionRecord } from './stripe-subscription'

type StripeInvoiceRecord = {
  id: string
  billingReason: string | null
  subscriptionId: string | null
  lines: SubscriptionInvoiceLine[]
}

type BillingPlan = 'individual' | 'workspace'

export interface CreditPackFulfillment {
  workspaceId: string
  supporterUserId: string
  checkoutSessionId: string
  credits: number
  priceId: string
  amountJpy: number
}

function parsePositiveInteger(value: string | undefined, label: string, sessionId: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Credit pack Checkout ${sessionId} has invalid ${label}`)
  }
  return parsed
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
  const credits = parsePositiveInteger(session.metadata['creditPackCredits'], 'credit quantity', session.id)
  const priceId = session.metadata['creditPackPriceId']
  const amountJpy = parsePositiveInteger(session.metadata['creditPackAmountJpy'], 'paid amount', session.id)
  if (
    !workspaceId ||
    !supporterUserId ||
    !priceId ||
    session.currency?.toLowerCase() !== 'jpy' ||
    session.amount_total !== amountJpy
  ) {
    throw new Error(`Credit pack Checkout ${session.id} is missing billing metadata`)
  }
  return { workspaceId, supporterUserId, checkoutSessionId: session.id, credits, priceId, amountJpy }
}

async function validateCreditPackLineItem(stripe: Stripe, fulfillment: CreditPackFulfillment) {
  const lineItems = await stripe.checkout.sessions.listLineItems(fulfillment.checkoutSessionId, { limit: 2 })
  const [lineItem] = lineItems.data
  if (
    lineItems.has_more ||
    lineItems.data.length !== 1 ||
    !lineItem ||
    lineItem.quantity !== 1 ||
    stripeId(lineItem.price) !== fulfillment.priceId ||
    lineItem.currency.toLowerCase() !== 'jpy' ||
    lineItem.amount_total !== fulfillment.amountJpy
  ) {
    throw new Error(`Credit pack Checkout ${fulfillment.checkoutSessionId} has unexpected line items`)
  }
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
  const lines: SubscriptionInvoiceLine[] = []
  if (billingReason === 'subscription_create' || billingReason === 'subscription_cycle') {
    // invoice.lines は先頭ページだけの場合があるため、Stripe のページングを最後まで辿る。
    for await (const line of stripe.invoices.listLineItems(value.id, { limit: 100 })) {
      lines.push({
        quantity: line.quantity,
        priceId: stripeId(line.pricing?.price_details?.price),
      })
    }
  }

  return {
    id: value.id,
    billingReason,
    subscriptionId:
      stripeId(value.subscription) ?? stripeId(value.parent?.subscription_details?.subscription),
    lines,
  }
}

export function resolveMonthlyCreditGrant(
  billingReason: string | null,
  lines: SubscriptionInvoiceLine[],
  plan: BillingPlan,
  activeMemberCount: number,
): number | null {
  const subscriptionPriceId =
    plan === 'workspace' ? getWorkspaceSubscriptionPriceId() : getIndividualSubscriptionPriceId()
  const quantity = resolveSubscriptionGrantQuantity(billingReason, lines, subscriptionPriceId)
  if (!quantity) return null

  if (plan === 'workspace') {
    return Math.max(
      BILLING_CONFIG.workspaceMonthlyCreditGrantMinimum,
      activeMemberCount * BILLING_CONFIG.workspaceMonthlyCreditGrantPerActiveMember,
    )
  }
  return BILLING_CONFIG.monthlyCreditGrant * quantity
}

function resolveBillingSubscriptionMetadata(
  metadata: Record<string, string> | null | undefined,
): Record<string, string> | null {
  const workspaceId = metadata?.['workspaceId']
  const supporterUserId = metadata?.['supporterUserId']
  const plan = metadata?.['plan']
  if (!workspaceId || !supporterUserId || (plan !== 'individual' && plan !== 'workspace')) return null
  return { workspaceId, supporterUserId, plan }
}

export function resolveSubscriptionPlan(subscription: StripeSubscriptionRecord): BillingPlan {
  if (subscription.priceId === getIndividualSubscriptionPriceId()) return 'individual'
  if (subscription.priceId === getWorkspaceSubscriptionPriceId()) return 'workspace'
  throw new Error(`Subscription ${subscription.id} has an unsupported billing price`)
}

export function resolveInvoicePlan(lines: SubscriptionInvoiceLine[]): BillingPlan {
  const individualPriceId = getIndividualSubscriptionPriceId()
  const workspacePriceId = getWorkspaceSubscriptionPriceId()
  const hasIndividual = lines.some((line) => line.priceId === individualPriceId)
  const hasWorkspace = lines.some((line) => line.priceId === workspacePriceId)
  if (hasIndividual === hasWorkspace) {
    throw new Error('Invoice has no unambiguous billing plan')
  }
  return hasWorkspace ? 'workspace' : 'individual'
}

export function isMonthlyGrantInvoice(billingReason: string | null): boolean {
  return billingReason === 'subscription_create' || billingReason === 'subscription_cycle'
}

async function syncSubscription(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  subscription: StripeSubscriptionRecord,
) {
  const workspaceId = subscription.metadata['workspaceId']
  const supporterUserId = subscription.metadata['supporterUserId']
  if (!workspaceId || !supporterUserId) {
    throw new Error(`Subscription ${subscription.id} is missing billing metadata`)
  }
  const plan = resolveSubscriptionPlan(subscription)

  await tx
    .insert(subscriptions)
    .values({
      workspaceId,
      supporterUserId,
      plan,
      stripeSubscriptionId: subscription.id,
      quantity: plan === 'workspace' ? 1 : subscription.quantity,
      status: toSubscriptionStatus(subscription.status),
      currentPeriodEnd: new Date(subscription.currentPeriodEnd * 1000),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        plan,
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
  let invoice: StripeInvoiceRecord | null = null
  let subscriptionId: string | null = null
  let checkoutSubscriptionMetadata: Record<string, string> | null = null
  let creditPackFulfillment: CreditPackFulfillment | null = null

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    subscriptionId = stripeId(session.subscription)
    creditPackFulfillment = resolveCreditPackFulfillment(session)
    checkoutSubscriptionMetadata = resolveBillingSubscriptionMetadata(session.metadata)
    if (creditPackFulfillment) await validateCreditPackLineItem(stripe, creditPackFulfillment)
  }
  if (event.type === 'invoice.paid') {
    invoice = await asInvoiceRecord(stripe, event.data.object as Stripe.Invoice)
    subscriptionId = invoice.subscriptionId
    invoiceId = invoice.id
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
      // Checkout Session のメタデータが購読に届かない場合でも、初回Webhookで正規化する。
      // これにより後続の invoice.paid でもワークスペースとプランを解決できる。
      if (
        checkoutSubscriptionMetadata &&
        !resolveBillingSubscriptionMetadata(subscription.metadata)
      ) {
        subscription = asStripeSubscriptionRecord(
          await stripe.subscriptions.update(subscriptionId, { metadata: checkoutSubscriptionMetadata }),
        )
      }
    }
    if (subscription) await syncSubscription(tx, subscription)
    if (creditPackFulfillment) {
      await tx
        .insert(creditLedger)
        .values({
          workspaceId: creditPackFulfillment.workspaceId,
          delta: creditPackFulfillment.credits,
          reason: 'pack_purchase',
          refId: creditPackFulfillment.checkoutSessionId,
        })
        .onConflictDoNothing()
    }
    // プラン変更・日割りの請求書には購読の請求行を展開していない。月次付与の対象外なので、
    // 先に除外して購読状態の同期だけを確定する。
    const isGrantInvoice = isMonthlyGrantInvoice(invoice?.billingReason ?? null)
    if (event.type === 'invoice.paid' && subscription && invoiceId && invoice && isGrantInvoice) {
      const workspaceId = subscription.metadata['workspaceId']
      if (!workspaceId)
        throw new Error(`Invoice ${invoiceId} subscription has no workspace metadata`)
      const plan = resolveInvoicePlan(invoice.lines)
      const grant = resolveMonthlyCreditGrant(
        invoice.billingReason,
        invoice.lines,
        plan,
        plan === 'workspace'
          ? (
              await tx
                .select({ userId: activeWorkspaceMembers.userId })
                .from(activeWorkspaceMembers)
                .where(eq(activeWorkspaceMembers.workspaceId, workspaceId))
            ).length
          : 0,
      )
      if (!grant) return { duplicate: false }
      await tx
        .insert(creditLedger)
        .values({
          workspaceId,
          delta: grant,
          reason: 'subscription_grant',
          refId: invoiceId,
        })
        .onConflictDoNothing()
    }
    return { duplicate: false }
  })
}
