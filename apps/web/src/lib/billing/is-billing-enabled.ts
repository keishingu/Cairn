// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { FEATURE_FLAGS } from '@cairn/shared'

/**
 * PreviewでStripeを設定したホスト版だけで課金機構を有効化する単一の境界。
 * セルフホストでは全エンタイトルメントを無制限として解決する。
 */
export function isBillingEnabled(
  stripeSecretKey = process.env['STRIPE_SECRET_KEY'],
  billingFeatureEnabled = FEATURE_FLAGS.billing,
): boolean {
  return billingFeatureEnabled && Boolean(stripeSecretKey)
}
