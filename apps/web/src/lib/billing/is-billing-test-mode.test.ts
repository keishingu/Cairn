// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { isBillingTestMode } from './is-billing-test-mode'

const originalBillingTestMode = process.env['BILLING_TEST_MODE']
const originalNodeEnv = process.env['NODE_ENV']
const originalVercelEnv = process.env['VERCEL_ENV']
const env = process.env as Record<string, string | undefined>

afterEach(() => {
  if (originalBillingTestMode === undefined) delete env['BILLING_TEST_MODE']
  else env['BILLING_TEST_MODE'] = originalBillingTestMode
  if (originalNodeEnv === undefined) delete env['NODE_ENV']
  else env['NODE_ENV'] = originalNodeEnv
  if (originalVercelEnv === undefined) delete env['VERCEL_ENV']
  else env['VERCEL_ENV'] = originalVercelEnv
})

describe('isBillingTestMode', () => {
  it('非本番で明示した場合だけ有効にする', () => {
    env['NODE_ENV'] = 'development'
    env['VERCEL_ENV'] = 'preview'
    env['BILLING_TEST_MODE'] = 'true'

    expect(isBillingTestMode()).toBe(true)
  })

  it('Vercel外のproductionでも無効にする', () => {
    env['NODE_ENV'] = 'production'
    delete env['VERCEL_ENV']
    env['BILLING_TEST_MODE'] = 'true'

    expect(isBillingTestMode()).toBe(false)
  })

  it('Vercel Previewではproduction buildでも有効にする', () => {
    env['NODE_ENV'] = 'production'
    env['VERCEL_ENV'] = 'preview'
    env['BILLING_TEST_MODE'] = 'true'

    expect(isBillingTestMode()).toBe(true)
  })
})
