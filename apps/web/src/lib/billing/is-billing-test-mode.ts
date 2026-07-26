// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** Preview / develop で明示的に有効化した場合だけ、決済を介さない検証を許可する。 */
export function isBillingTestMode(): boolean {
  return process.env['VERCEL_ENV'] !== 'production' && process.env['BILLING_TEST_MODE'] === 'true'
}
