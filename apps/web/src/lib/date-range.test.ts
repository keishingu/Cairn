// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { isEndBeforeStart } from './date-range'

describe('isEndBeforeStart', () => {
  test('終了日が開始日より前の時だけ true', () => {
    expect(isEndBeforeStart('2026-10-18', '2026-10-17')).toBe(true)
    expect(isEndBeforeStart('2026-10-17', '2026-10-17')).toBe(false)
    expect(isEndBeforeStart('2026-10-17', '2026-10-18')).toBe(false)
  })

  test('どちらかが未設定なら判定しない', () => {
    expect(isEndBeforeStart(null, '2026-10-17')).toBe(false)
    expect(isEndBeforeStart('2026-10-18', undefined)).toBe(false)
  })
})
