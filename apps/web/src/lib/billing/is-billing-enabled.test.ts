// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { isBillingEnabled } from './is-billing-enabled'

const originalStripeSecretKey = process.env['STRIPE_SECRET_KEY']

afterEach(() => {
  if (originalStripeSecretKey === undefined) {
    delete process.env['STRIPE_SECRET_KEY']
  } else {
    process.env['STRIPE_SECRET_KEY'] = originalStripeSecretKey
  }
})

describe('isBillingEnabled', () => {
  it('Stripe シークレットキー未設定時は課金を無効にする', () => {
    delete process.env['STRIPE_SECRET_KEY']

    expect(isBillingEnabled()).toBe(false)
  })

  it('Stripe シークレットキー設定時は課金を有効にする', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_example'

    expect(isBillingEnabled()).toBe(true)
  })
})
