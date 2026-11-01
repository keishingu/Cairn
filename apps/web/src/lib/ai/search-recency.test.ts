// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { rankByRecency, recencyFactor } from './search-recency'

const now = new Date('2026-11-01T00:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

describe('recencyFactor', () => {
  test('半減期ちょうどで 0.5、その倍で 0.25 になる', () => {
    expect(recencyFactor(daysAgo(365), now, 365)).toBeCloseTo(0.5)
    expect(recencyFactor(daysAgo(730), now, 365)).toBeCloseTo(0.25)
  })

  test('今日と未来の日付は係数 1 にする', () => {
    expect(recencyFactor(now, now, 365)).toBe(1)
    expect(recencyFactor(daysAgo(-30), now, 365)).toBe(1)
  })
})

describe('rankByRecency', () => {
  test('意味の近さが少し低くても、新しい資料を古い資料より上にする', () => {
    const ranked = rankByRecency(
      [
        { id: 'old', similarity: 0.8, sourceDate: daysAgo(730) },
        { id: 'new', similarity: 0.7, sourceDate: daysAgo(10) },
      ],
      365,
      now,
    )

    expect(ranked.map((item) => item.id)).toEqual(['new', 'old'])
    expect(ranked[1]!.score).toBeCloseTo(0.2)
  })

  test('意味の近さの差が大きければ、古い資料でも上に残す', () => {
    const ranked = rankByRecency(
      [
        { id: 'old', similarity: 0.9, sourceDate: daysAgo(180) },
        { id: 'new', similarity: 0.55, sourceDate: daysAgo(1) },
      ],
      365 * 3,
      now,
    )

    expect(ranked.map((item) => item.id)).toEqual(['old', 'new'])
  })

  test('日付を持たない資料（メンバーなど）には係数を掛けず、同点は元の順を保つ', () => {
    const ranked = rankByRecency(
      [
        { id: 'member', similarity: 0.6, sourceDate: null },
        { id: 'today', similarity: 0.6, sourceDate: now },
      ],
      182,
      now,
    )

    expect(ranked.map((item) => [item.id, item.score])).toEqual([['member', 0.6], ['today', 0.6]])
  })
})
