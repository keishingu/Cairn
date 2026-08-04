// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { resolveCreditPackFulfillment, resolveMonthlyCreditGrant } from './stripe-webhook'

const originalIndividualPriceId = process.env['STRIPE_INDIVIDUAL_PRICE_ID']
const originalWorkspacePriceId = process.env['STRIPE_WORKSPACE_PRICE_ID']

afterEach(() => {
  if (originalIndividualPriceId === undefined) {
    delete process.env['STRIPE_INDIVIDUAL_PRICE_ID']
  } else {
    process.env['STRIPE_INDIVIDUAL_PRICE_ID'] = originalIndividualPriceId
  }
  if (originalWorkspacePriceId === undefined) {
    delete process.env['STRIPE_WORKSPACE_PRICE_ID']
  } else {
    process.env['STRIPE_WORKSPACE_PRICE_ID'] = originalWorkspacePriceId
  }
})

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

describe('resolveMonthlyCreditGrant', () => {
  it('Teamの初回請求はTeam価格の請求行から最低900石を付与する', () => {
    process.env['STRIPE_WORKSPACE_PRICE_ID'] = 'price_workspace'

    expect(
      resolveMonthlyCreditGrant(
        'subscription_create',
        [{ quantity: 1, priceId: 'price_workspace' }],
        'workspace',
        1,
      ),
    ).toBe(900)
  })

  it('Teamの月次付与はアクティブメンバー数に応じて増える', () => {
    process.env['STRIPE_WORKSPACE_PRICE_ID'] = 'price_workspace'

    expect(
      resolveMonthlyCreditGrant(
        'subscription_cycle',
        [{ quantity: 1, priceId: 'price_workspace' }],
        'workspace',
        5,
      ),
    ).toBe(1500)
  })

  it('Soloの月次付与はSolo価格の口数に応じる', () => {
    process.env['STRIPE_INDIVIDUAL_PRICE_ID'] = 'price_individual'

    expect(
      resolveMonthlyCreditGrant(
        'subscription_cycle',
        [{ quantity: 2, priceId: 'price_individual' }],
        'individual',
        0,
      ),
    ).toBe(600)
  })
})
