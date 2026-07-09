// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { clampDayOfMonth, computeNextRunAt } from './schedule'

describe('scheduled job schedule helpers', () => {
  it('31日指定を月末へクランプする', () => {
    expect(clampDayOfMonth(2026, 2, 31)).toBe(28)
    expect(clampDayOfMonth(2028, 2, 31)).toBe(29)
  })

  it('同月の未来時刻を nextRunAt にする', () => {
    const next = computeNextRunAt(
      { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
      new Date('2026-07-09T05:00:00.000Z'),
    )

    expect(next.toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it('過ぎていたら翌月へ送る', () => {
    const next = computeNextRunAt(
      { type: 'monthly', dayOfMonth: 5, hour: 9, minute: 0 },
      new Date('2026-07-09T05:00:00.000Z'),
    )

    expect(next.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })
})
