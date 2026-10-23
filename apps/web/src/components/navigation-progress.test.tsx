// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { NavigationProgress } from './navigation-progress'

let pathname = '/chats/one'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}))

describe('NavigationProgress', () => {
  afterEach(() => {
    vi.useRealTimers()
    pathname = '/chats/one'
  })

  test('開始処理より先に遷移完了を検知しても10秒間残らない', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<NavigationProgress />)

    act(() => {
      window.history.pushState({}, '', '/chats/two')
      pathname = '/chats/two'
      rerender(<NavigationProgress />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    const indicator = container.querySelector('[aria-hidden]') as HTMLElement
    expect(indicator.firstElementChild).toHaveStyle({ width: '100%' })

    act(() => vi.advanceTimersByTime(380))
    expect(indicator).toHaveStyle({ opacity: '0' })
  })
})
