import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAutoPresence } from './use-auto-presence'

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

function setHasFocus(value: boolean) {
  Object.defineProperty(document, 'hasFocus', {
    configurable: true,
    value: vi.fn(() => value),
  })
}

describe('useAutoPresence', () => {
  it('ページを閉じる時に offline を keepalive 付きで送る', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', updateStatus }))

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', { keepalive: true })
    })
  })

  it('非表示になったら offline を送る', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', updateStatus }))

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })

    setVisibilityState('hidden')
    setHasFocus(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })
  })

  it('offline 状態で表示に戻ったら online に戻す', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue(true)

    const { rerender } = renderHook(
      ({ status }) => useAutoPresence({ status, updateStatus }),
      { initialProps: { status: 'offline' as const } },
    )

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })

    setVisibilityState('visible')
    setHasFocus(true)
    rerender({ status: 'offline' as const })

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('online', undefined)
    })
  })

  it('手動で away / busy を選んでいる間は自動更新しない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'busy', updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })
})
