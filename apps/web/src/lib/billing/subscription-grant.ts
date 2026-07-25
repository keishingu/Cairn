// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface SubscriptionInvoiceLine {
  quantity?: number | null
  priceId?: string | null
}

/**
 * 月次付与の対象となる Stripe 請求書だけから、実際に請求された口数を取り出す。
 * 更新・日割り請求書はクレジットを付与しない。
 */
export function resolveSubscriptionGrantQuantity(
  billingReason: string | null,
  lines: SubscriptionInvoiceLine[] | undefined,
  subscriptionPriceId: string,
): number | null {
  if (billingReason !== 'subscription_create' && billingReason !== 'subscription_cycle') {
    return null
  }

  // 購読の請求書には一回限りの invoice item も混在し得るため、先頭行や任意の
  // quantity ではなく、Checkout で使う価格に一致する購読行だけを採用する。
  const quantity = lines?.find((line) => line.priceId === subscriptionPriceId)?.quantity
  if (!quantity || !Number.isInteger(quantity)) {
    throw new Error('Monthly subscription invoice has no matching subscription quantity')
  }
  return quantity
}
