// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from '@cairn/core/billing'

type CreditPackCheckoutSession = {
  id: string
  url: string | null
  metadata: Record<string, string> | null
}

export function isConfiguredCreditPackPrice(price: {
  active: boolean
  currency: string
  type: string
  unit_amount: number | null
}): boolean {
  return (
    price.active &&
    price.type === 'one_time' &&
    price.currency.toLowerCase() === 'jpy' &&
    price.unit_amount === BILLING_CONFIG.creditPackPriceJpy
  )
}

export function isReusableCreditPackCheckout(
  session: CreditPackCheckoutSession,
  input: { workspaceId: string; supporterUserId: string; priceId: string },
): boolean {
  return (
    session.metadata?.['workspaceId'] === input.workspaceId &&
    session.metadata?.['supporterUserId'] === input.supporterUserId &&
    session.metadata?.['purchaseType'] === 'credit_pack' &&
    session.metadata?.['creditPackCredits'] === String(BILLING_CONFIG.creditPackCredits) &&
    session.metadata?.['creditPackPriceId'] === input.priceId &&
    session.metadata?.['creditPackAmountJpy'] === String(BILLING_CONFIG.creditPackPriceJpy)
  )
}
