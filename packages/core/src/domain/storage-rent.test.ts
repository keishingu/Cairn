// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { BYTES_PER_GIB } from './billing-config'
import { calculateStorageRentAccrual, settleStorageRent } from './storage-rent'

describe('calculateStorageRentAccrual', () => {
  it('1GiBを30日保有した家賃を月額レートで計算する', () => {
    expect(calculateStorageRentAccrual(
      BYTES_PER_GIB,
      new Date('2026-04-01T00:00:00+09:00'),
      new Date('2026-05-01T00:00:00+09:00'),
    )).toBe(4)
  })

  it('月途中の保有期間を日割りにする', () => {
    expect(calculateStorageRentAccrual(
      BYTES_PER_GIB,
      new Date('2026-04-16T00:00:00+09:00'),
      new Date('2026-05-01T00:00:00+09:00'),
    )).toBe(2)
  })

  it('JST月境界をまたぐ期間を各月の日数で日割りにする', () => {
    expect(calculateStorageRentAccrual(
      BYTES_PER_GIB,
      new Date('2026-01-31T00:00:00+09:00'),
      new Date('2026-02-02T00:00:00+09:00'),
    )).toBeCloseTo(4 / 31 + 4 / 28)
  })

  it('保有量または経過時間が0なら家賃を発生させない', () => {
    const at = new Date('2026-04-01T00:00:00+09:00')
    expect(calculateStorageRentAccrual(0, at, new Date('2026-04-02T00:00:00+09:00'))).toBe(0)
    expect(calculateStorageRentAccrual(BYTES_PER_GIB, at, at)).toBe(0)
  })
})

describe('settleStorageRent', () => {
  it('整数分だけを台帳へ記帳し、端数を繰り越す', () => {
    expect(settleStorageRent(0.4, 0.7)).toEqual({ debitCredits: 1, remainingCredits: 0.1 })
  })

  it('端数だけなら次回へ繰り越す', () => {
    expect(settleStorageRent(0.25, 0.5)).toEqual({ debitCredits: 0, remainingCredits: 0.75 })
  })
})
