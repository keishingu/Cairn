// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { BILLING_CONFIG } from '@cairn/core/billing'

describe('初期クレジットパック', () => {
  it('月額購読と分離した初期の単発売価・付与数を持つ', () => {
    expect(BILLING_CONFIG.creditPackPriceJpy).toBe(500)
    expect(BILLING_CONFIG.creditPackCredits).toBe(400)
  })

  it('能動AIとHeartbeatの消費数を定数に集約する', () => {
    expect(BILLING_CONFIG.activeAiRequestCredits).toBe(10)
    expect(BILLING_CONFIG.heartbeatAiDeliveryCredits).toBe(10)
  })
})
