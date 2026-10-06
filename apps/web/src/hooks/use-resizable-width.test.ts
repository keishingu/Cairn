// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { clampWidth, parseStoredWidth } from './use-resizable-width'

describe('clampWidth: 幅の範囲制限', () => {
  it('最小・最大の範囲に収め、整数に丸める', () => {
    expect(clampWidth(100, 200, 480)).toBe(200)
    expect(clampWidth(900, 200, 480)).toBe(480)
    expect(clampWidth(300.6, 200, 480)).toBe(301)
  })
})

describe('parseStoredWidth: 保存した幅の読み取り', () => {
  it('保存値がなければ既定幅を返す', () => {
    expect(parseStoredWidth(null, 240, 200, 480)).toBe(240)
  })

  it('保存値を範囲内に収めて返す', () => {
    expect(parseStoredWidth('320', 240, 200, 480)).toBe(320)
    expect(parseStoredWidth('9999', 240, 200, 480)).toBe(480)
  })

  it('数値として読めない保存値は既定幅を返す', () => {
    expect(parseStoredWidth('abc', 240, 200, 480)).toBe(240)
  })
})
