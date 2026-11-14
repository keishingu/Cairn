// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type Stripe from 'stripe'

export interface StripeSubscriptionRecord {
  id: string
  status: string
  quantity: number
  currentPeriodEnd: number
  metadata: Record<string, string>
}

export function asStripeSubscriptionRecord(
  subscription: Stripe.Subscription,
): StripeSubscriptionRecord {
  const value = subscription as unknown as {
    id: string
    status: string
    items: { data: Array<{ quantity: number | null; current_period_end?: number }> }
    metadata: Record<string, string>
  }
  const firstItem = value.items.data[0]
  const currentPeriodEnd = firstItem?.current_period_end
  if (!firstItem || typeof currentPeriodEnd !== 'number' || !Number.isFinite(currentPeriodEnd)) {
    throw new Error(`Subscription ${value.id} has no current period end`)
  }

  return {
    id: value.id,
    status: value.status,
    quantity: firstItem.quantity ?? 1,
    currentPeriodEnd,
    metadata: value.metadata,
  }
}
