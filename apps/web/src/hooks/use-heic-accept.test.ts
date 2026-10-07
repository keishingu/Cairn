// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { isIosLike } from './use-heic-accept'

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

describe('isIosLike', () => {
  it('iPhone と、iPad を名乗る UA を iOS と判定する', () => {
    expect(isIosLike('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe(true)
    expect(isIosLike('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe(true)
  })

  it('Mac の UA を名乗る iPad（iPadOS 13 以降の既定）を、タッチ点の数で iOS と判定する', () => {
    expect(isIosLike(MAC_UA, 5)).toBe(true)
  })

  it('タッチ画面の無い Mac と、Windows・Android は iOS と判定しない', () => {
    expect(isIosLike(MAC_UA, 0)).toBe(false)
    expect(isIosLike('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36', 10)).toBe(false)
    expect(isIosLike('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36', 5)).toBe(false)
  })
})
