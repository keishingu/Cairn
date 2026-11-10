// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { billingMonthStart, canSeeWorkspaceAiUsage } from './ai-usage'

describe('billingMonthStart', () => {
  test('日本時間の今月1日 0:00 を返す', () => {
    expect(billingMonthStart(new Date('2026-11-10T09:00:00Z')).toISOString()).toBe('2026-10-31T15:00:00.000Z')
  })

  test('UTC ではまだ前月でも、日本時間で月が変わっていれば新しい月から数える', () => {
    // 2026-11-30T16:00Z は日本時間の 12/1 1:00
    expect(billingMonthStart(new Date('2026-11-30T16:00:00Z')).toISOString()).toBe('2026-11-30T15:00:00.000Z')
  })

  test('年をまたぐ月も求められる', () => {
    expect(billingMonthStart(new Date('2027-01-01T00:00:00Z')).toISOString()).toBe('2026-12-31T15:00:00.000Z')
  })
})

describe('canSeeWorkspaceAiUsage', () => {
  test('ワークスペース全体の合計を見られるのは owner と admin だけ', () => {
    expect(canSeeWorkspaceAiUsage('owner')).toBe(true)
    expect(canSeeWorkspaceAiUsage('admin')).toBe(true)
    expect(canSeeWorkspaceAiUsage('member')).toBe(false)
    expect(canSeeWorkspaceAiUsage('guest')).toBe(false)
  })
})
