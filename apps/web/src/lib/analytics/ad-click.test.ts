// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'
import { isOpenAiAdsConfigured, normalizeOppref, readOpprefFromCookieHeader } from './ad-click'

describe('normalizeOppref', () => {
  test('値はそのまま返し、空と長すぎる値は捨てる', () => {
    expect(normalizeOppref('abc.DEF_123=')).toBe('abc.DEF_123=')
    expect(normalizeOppref('')).toBeNull()
    expect(normalizeOppref(null)).toBeNull()
    expect(normalizeOppref('x'.repeat(1025))).toBeNull()
  })
})

describe('readOpprefFromCookieHeader', () => {
  test('エンコードされた Cookie の値を元の文字列に戻す', () => {
    const header = `a=1; cairn_oppref=${encodeURIComponent('op/ref+=1')}; b=2`
    expect(readOpprefFromCookieHeader(header)).toBe('op/ref+=1')
  })

  test('Cookie が無ければ null', () => {
    expect(readOpprefFromCookieHeader(null)).toBeNull()
    expect(readOpprefFromCookieHeader('a=1; cairn_opprefx=2')).toBeNull()
  })

  test('壊れたエンコードは null', () => {
    expect(readOpprefFromCookieHeader('cairn_oppref=%E0%A4%A')).toBeNull()
  })
})

describe('isOpenAiAdsConfigured', () => {
  afterEach(() => vi.unstubAllEnvs())

  test('Pixel ID と API キーの両方があるときだけ有効', () => {
    vi.stubEnv('OPENAI_ADS_PIXEL_ID', 'px')
    vi.stubEnv('OPENAI_ADS_CONVERSIONS_API_KEY', '')
    expect(isOpenAiAdsConfigured()).toBe(false)
    vi.stubEnv('OPENAI_ADS_CONVERSIONS_API_KEY', 'key')
    expect(isOpenAiAdsConfigured()).toBe(true)
  })
})
