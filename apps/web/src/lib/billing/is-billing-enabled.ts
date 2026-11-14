// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Stripe を設定したホスト版だけで課金機構を有効化する単一の境界。
 * セルフホストでは全エンタイトルメントを無制限として解決する。
 */
export function isBillingEnabled(): boolean {
  return Boolean(process.env['STRIPE_SECRET_KEY'])
}
