// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { isBillingTestMode } from './is-billing-test-mode'

const originalBillingTestMode = process.env['BILLING_TEST_MODE']
const originalNodeEnv = process.env['NODE_ENV']
const originalVercelEnv = process.env['VERCEL_ENV']

afterEach(() => {
  if (originalBillingTestMode === undefined) delete process.env['BILLING_TEST_MODE']
  else process.env['BILLING_TEST_MODE'] = originalBillingTestMode
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV']
  else process.env['NODE_ENV'] = originalNodeEnv
  if (originalVercelEnv === undefined) delete process.env['VERCEL_ENV']
  else process.env['VERCEL_ENV'] = originalVercelEnv
})

describe('isBillingTestMode', () => {
  it('非本番で明示した場合だけ有効にする', () => {
    process.env['NODE_ENV'] = 'development'
    process.env['VERCEL_ENV'] = 'preview'
    process.env['BILLING_TEST_MODE'] = 'true'

    expect(isBillingTestMode()).toBe(true)
  })

  it('Vercel外のproductionでも無効にする', () => {
    process.env['NODE_ENV'] = 'production'
    delete process.env['VERCEL_ENV']
    process.env['BILLING_TEST_MODE'] = 'true'

    expect(isBillingTestMode()).toBe(false)
  })
})
