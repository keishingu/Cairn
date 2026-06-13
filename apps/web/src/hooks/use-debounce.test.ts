import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDebounce } from './use-debounce'

describe('useDebounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('初期値をすぐに返す', () => {
    const { result } = renderHook(() => useDebounce('初期値', 300))
    expect(result.current).toBe('初期値')
  })

  it('指定した遅延時間が経過すると新しい値を返す', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: '初期値' } },
    )
    rerender({ value: '新しい値' })
    expect(result.current).toBe('初期値')
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('新しい値')
  })

  it('遅延中に連続して値が変わった場合は最後の値だけを返す', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )
    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(100) })
    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('c')
  })
})
