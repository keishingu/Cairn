// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { resolveSubscriptionGrantQuantity } from './subscription-grant'

describe('resolveSubscriptionGrantQuantity', () => {
  it.each(['subscription_create', 'subscription_cycle'])(
    '%s の請求書には請求された口数を付与する',
    (billingReason) => {
      expect(
        resolveSubscriptionGrantQuantity(
          billingReason,
          [{ quantity: 3, priceId: 'price_individual' }],
          'price_individual',
        ),
      ).toBe(3)
    },
  )

  it('更新・日割り請求書には付与しない', () => {
    expect(
      resolveSubscriptionGrantQuantity(
        'subscription_update',
        [{ quantity: 3, priceId: 'price_individual' }],
        'price_individual',
      ),
    ).toBeNull()
  })

  it('月次請求書に口数が無い場合は失敗として再試行させる', () => {
    expect(() =>
      resolveSubscriptionGrantQuantity('subscription_cycle', [], 'price_individual'),
    ).toThrow('Monthly subscription invoice has no matching subscription quantity')
  })

  it('混在する一回限りの請求行ではなく購読価格の行を使う', () => {
    expect(
      resolveSubscriptionGrantQuantity(
        'subscription_cycle',
        [
          { quantity: 99, priceId: 'price_one_off' },
          { quantity: 2, priceId: 'price_individual' },
        ],
        'price_individual',
      ),
    ).toBe(2)
  })
})
