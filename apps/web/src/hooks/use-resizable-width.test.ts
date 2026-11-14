// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { clampWidth, fitWidth, parseStoredWidth, useResizableWidth } from './use-resizable-width'

describe('clampWidth: 幅の範囲制限', () => {
  it('最小・最大の範囲に収め、整数に丸める', () => {
    expect(clampWidth(100, 200, 480)).toBe(200)
    expect(clampWidth(900, 200, 480)).toBe(480)
    expect(clampWidth(300.6, 200, 480)).toBe(301)
  })
})

describe('fitWidth: 表示幅の上限', () => {
  it('上限が無ければ幅をそのまま返す', () => {
    expect(fitWidth(480)).toBe(480)
  })

  it('上限より広い幅は表示だけを上限へ縮める', () => {
    expect(fitWidth(480, 200)).toBe(200)
    expect(fitWidth(180, 200)).toBe(180)
    expect(fitWidth(480, -20)).toBe(0)
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

describe('useResizableWidth: 区切り線の動かし方', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('左パネルの右端は右へ動かすと広がり、左へ動かすと狭まる', () => {
    const options = { storageKey: STORAGE_KEYS.chat_sidebar_width, defaultWidth: 240, min: 200, max: 480 }
    const { result } = renderHook(() => useResizableWidth(options))
    act(() => { result.current.handleProps.onPointerDown?.(pointer(100)) })
    act(() => { result.current.handleProps.onPointerMove?.(pointer(140)) })
    expect(result.current.width).toBe(280)
    act(() => { result.current.handleProps.onKeyDown?.(key('ArrowLeft')) })
    expect(result.current.width).toBe(264)
    expect(store.get(options.storageKey)).toBe('264')
  })

  it('右パネルの左端は左へ動かすと広がり、右へ動かすと狭まる', () => {
    const options = { storageKey: STORAGE_KEYS.chat_detail_width, defaultWidth: 280, min: 240, max: 480, edge: 'start' as const }
    const { result } = renderHook(() => useResizableWidth(options))
    act(() => { result.current.handleProps.onPointerDown?.(pointer(100)) })
    act(() => { result.current.handleProps.onPointerMove?.(pointer(60)) })
    expect(result.current.width).toBe(320)
    act(() => { result.current.handleProps.onPointerUp?.(pointer(60)) })
    expect(store.get(options.storageKey)).toBe('320')

    act(() => { result.current.handleProps.onKeyDown?.(key('ArrowRight')) })
    expect(result.current.width).toBe(304)
    expect(store.get(options.storageKey)).toBe('304')
  })

  it('上限より広い保存幅は表示だけ縮め、保存値は残す', () => {
    store.set(STORAGE_KEYS.chat_detail_width, '480')
    const options = { storageKey: STORAGE_KEYS.chat_detail_width, defaultWidth: 280, min: 240, max: 480, edge: 'start' as const }
    // 初期値を number のまま渡すと rerender の引数が number に推論され、上限なしの undefined を渡せない
    const props: { ceiling: number | undefined } = { ceiling: 200 }
    const { result, rerender } = renderHook(
      ({ ceiling }: { ceiling: number | undefined }) => useResizableWidth({ ...options, ceiling }),
      { initialProps: props },
    )
    expect(result.current.width).toBe(200)
    expect(store.get(options.storageKey)).toBe('480')

    rerender({ ceiling: 360 })
    expect(result.current.width).toBe(360)
    expect(store.get(options.storageKey)).toBe('480')

    rerender({ ceiling: undefined })
    expect(result.current.width).toBe(480)
  })
})

function pointer(clientX: number): React.PointerEvent<HTMLElement> {
  return {
    button: 0,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn() },
  } as unknown as React.PointerEvent<HTMLElement>
}

function key(keyName: string): React.KeyboardEvent<HTMLElement> {
  return { key: keyName, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>
}
