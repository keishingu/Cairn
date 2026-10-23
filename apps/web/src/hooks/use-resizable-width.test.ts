// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { clampWidth, parseStoredWidth, useResizableWidth } from './use-resizable-width'

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

describe('useResizableWidth: 描画前の幅復元', () => {
  const options = { storageKey: STORAGE_KEYS.chat_sidebar_width, defaultWidth: 240, min: 200, max: 480 }

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(options.storageKey)
  })

  it('再マウント時もブラウザ描画前のレイアウト処理中に保存幅を読み込む', () => {
    localStorage.setItem(options.storageKey, '360')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const restoredDuringLayout: boolean[] = []
    const mount = () => renderHook(() => {
      const resize = useResizableWidth(options)
      React.useLayoutEffect(() => {
        restoredDuringLayout.push(getItem.mock.calls.some(([key]) => key === options.storageKey))
      }, [])
      return resize
    })

    const first = mount()
    expect(first.result.current.width).toBe(360)
    first.unmount()
    getItem.mockClear()

    const next = mount()
    expect(next.result.current.width).toBe(360)
    expect(restoredDuringLayout).toEqual([true, true])
  })

})
