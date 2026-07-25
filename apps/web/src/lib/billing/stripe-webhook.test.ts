// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { resolveCreditPackFulfillment } from './stripe-webhook'

function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: 'cs_credit_pack',
    metadata: {
      purchaseType: 'credit_pack',
      workspaceId: 'workspace-1',
      supporterUserId: 'user-1',
      creditPackCredits: '400',
      creditPackPriceId: 'price_credit_pack',
      creditPackAmountJpy: '500',
    },
    payment_status: 'paid',
    currency: 'jpy',
    amount_total: 500,
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('resolveCreditPackFulfillment', () => {
  it('支払い済みのクレジットパックだけをWebhookの付与対象にする', () => {
    expect(resolveCreditPackFulfillment(checkoutSession())).toEqual({
      workspaceId: 'workspace-1',
      supporterUserId: 'user-1',
      checkoutSessionId: 'cs_credit_pack',
      credits: 400,
      priceId: 'price_credit_pack',
      amountJpy: 500,
    })
  })

  it('未払いまたは別種別のCheckoutを付与対象にしない', () => {
    expect(resolveCreditPackFulfillment(checkoutSession({ payment_status: 'unpaid' }))).toBeNull()
    expect(
      resolveCreditPackFulfillment(checkoutSession({ metadata: { purchaseType: 'other' } })),
    ).toBeNull()
  })

  it('購入に必要なメタデータがない決済は再試行対象のエラーにする', () => {
    expect(() =>
      resolveCreditPackFulfillment(checkoutSession({ metadata: { purchaseType: 'credit_pack' } })),
    ).toThrow('Credit pack Checkout cs_credit_pack is missing billing metadata')
  })

  it('Checkoutに保存した決済額と実支払額が異なる場合は付与しない', () => {
    expect(() => resolveCreditPackFulfillment(checkoutSession({ amount_total: 499 }))).toThrow(
      'Credit pack Checkout cs_credit_pack is missing billing metadata',
    )
  })
})
