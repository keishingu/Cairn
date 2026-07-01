// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { getReactionTooltip } from './reaction-tooltip'

describe('getReactionTooltip', () => {
  it('参加者名をカンマ区切りで返す', () => {
    expect(getReactionTooltip({ userNames: ['Alice', 'Bob'] })).toBe('Alice, Bob')
  })

  it('参加者がいなければ undefined を返す', () => {
    expect(getReactionTooltip({ userNames: [] })).toBeUndefined()
  })
})
