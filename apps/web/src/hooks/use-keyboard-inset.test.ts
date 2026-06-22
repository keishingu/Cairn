import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { useKeyboardInset } from './use-keyboard-inset'

// jsdom は visualViewport を実装しないため、テスト用に簡易な EventTarget でモックする
class FakeVisualViewport extends EventTarget {
  height: number
  offsetTop: number
  constructor(height: number, offsetTop = 0) {
    super()
    this.height = height
    this.offsetTop = offsetTop
  }
}

function setViewport(vv: FakeVisualViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
}

describe('useKeyboardInset', () => {
  afterEach(() => { setViewport(undefined) })

  it('visualViewport が存在しない場合は 0 を返す', () => {
    setViewport(undefined)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })

  it('キーボードが閉じている（visualViewport が window と同じ高さ）場合は 0 を返す', () => {
    setViewport(new FakeVisualViewport(window.innerHeight))
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })

  it('キーボード表示中は window との高さの差分を返す', () => {
    const vv = new FakeVisualViewport(window.innerHeight - 300)
    setViewport(vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(300)
  })

  it('resize イベントで最新の inset に更新する', () => {
    const vv = new FakeVisualViewport(window.innerHeight)
    setViewport(vv)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)

    act(() => {
      vv.height = window.innerHeight - 250
      vv.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(250)
  })
})
