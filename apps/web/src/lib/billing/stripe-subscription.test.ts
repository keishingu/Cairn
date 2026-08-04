// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { asStripeSubscriptionRecord } from './stripe-subscription'

describe('asStripeSubscriptionRecord', () => {
  it('subscription item の current_period_end を使う', () => {
    const subscription = {
      id: 'sub_1',
      status: 'active',
      metadata: { workspaceId: 'workspace-1' },
      items: {
        data: [{ quantity: 2, current_period_end: 1_800_000_000, price: { id: 'price_1' } }],
      },
    } as unknown as Stripe.Subscription

    expect(asStripeSubscriptionRecord(subscription)).toMatchObject({
      quantity: 2,
      currentPeriodEnd: 1_800_000_000,
      priceId: 'price_1',
    })
  })

  it('period end が無い subscription を同期しない', () => {
    const subscription = {
      id: 'sub_1',
      status: 'active',
      metadata: {},
      items: { data: [{ quantity: 1 }] },
    } as unknown as Stripe.Subscription

    expect(() => asStripeSubscriptionRecord(subscription)).toThrow(
      'Subscription sub_1 has no current period end',
    )
  })
})
