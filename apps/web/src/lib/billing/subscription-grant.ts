// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 月次付与の対象となる Stripe 請求書だけから、実際に請求された口数を取り出す。
 * 更新・日割り請求書はクレジットを付与しない。
 */
export function resolveSubscriptionGrantQuantity(
  billingReason: string | null,
  lines: Array<{ quantity?: number | null }> | undefined,
): number | null {
  if (billingReason !== 'subscription_create' && billingReason !== 'subscription_cycle') {
    return null
  }

  const quantity = lines?.find(line => line.quantity !== null && line.quantity !== undefined)?.quantity
  if (!quantity || !Number.isInteger(quantity)) {
    throw new Error('Monthly subscription invoice has no quantity')
  }
  return quantity
}
