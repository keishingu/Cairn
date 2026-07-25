// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { getCreditPackPriceId, resolveApplicationUrl } from './stripe'

const originalAppUrl = process.env['APP_URL']
const originalVercelUrl = process.env['VERCEL_URL']
const originalCreditPackPriceId = process.env['STRIPE_CREDIT_PACK_PRICE_ID']

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env['APP_URL']
  } else {
    process.env['APP_URL'] = originalAppUrl
  }
  if (originalVercelUrl === undefined) {
    delete process.env['VERCEL_URL']
  } else {
    process.env['VERCEL_URL'] = originalVercelUrl
  }
  if (originalCreditPackPriceId === undefined) {
    delete process.env['STRIPE_CREDIT_PACK_PRICE_ID']
  } else {
    process.env['STRIPE_CREDIT_PACK_PRICE_ID'] = originalCreditPackPriceId
  }
})

describe('resolveApplicationUrl', () => {
  it('APP_URLが設定されている場合は末尾のスラッシュを除いたURLを返す', () => {
    process.env['APP_URL'] = 'https://oss-cairn.com/'

    expect(
      resolveApplicationUrl(new Request('https://develop.oss-cairn.com/api/billing/checkout')),
    ).toBe('https://oss-cairn.com')
  })

  it('APP_URL未設定時はVercel固有URLではなくリクエスト元のURLを返す', () => {
    delete process.env['APP_URL']
    process.env['VERCEL_URL'] = 'cairn-random-deployment.vercel.app'

    expect(
      resolveApplicationUrl(new Request('https://develop.oss-cairn.com/api/billing/checkout')),
    ).toBe('https://develop.oss-cairn.com')
  })
})

describe('getCreditPackPriceId', () => {
  it('単発クレジットパックのPrice IDを返す', () => {
    process.env['STRIPE_CREDIT_PACK_PRICE_ID'] = 'price_credit_pack'

    expect(getCreditPackPriceId()).toBe('price_credit_pack')
  })

  it('Price ID未設定時は設定漏れを表示できるエラーにする', () => {
    delete process.env['STRIPE_CREDIT_PACK_PRICE_ID']

    expect(() => getCreditPackPriceId()).toThrow('STRIPE_CREDIT_PACK_PRICE_ID is not configured')
  })
})
