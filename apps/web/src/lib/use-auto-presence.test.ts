import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordManualPresenceStatus, useAutoPresence } from './use-auto-presence'

const TAB_ACTIVITY_STORAGE_KEY = 'cairn:auto-presence:tabs'
const DEFAULT_WORKSPACE_ID = 'ws-1'

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
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('ページを閉じる時に offline を keepalive 付きで送る', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

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

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

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

  it('他のタブがアクティブなら hidden になっても offline を送らない', async () => {
    localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, JSON.stringify({
      other: { active: true, updatedAt: Date.now(), workspaceId: DEFAULT_WORKSPACE_ID },
    }))
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('他のタブがアクティブなら pagehide でも offline を送らない', async () => {
    localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, JSON.stringify({
      other: { active: true, updatedAt: Date.now(), workspaceId: DEFAULT_WORKSPACE_ID },
    }))
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
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

    renderHook(() => useAutoPresence({ status: 'busy', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('手動で offline を選んでいる間は visible でも online に戻さない', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    recordManualPresenceStatus('offline', DEFAULT_WORKSPACE_ID)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'offline', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('別タブで手動 busy を選んでいる間は stale な online 状態でも自動更新しない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    recordManualPresenceStatus('busy', DEFAULT_WORKSPACE_ID)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('別タブで手動 away を選んでいる間は stale な online 状態でも自動更新しない', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    recordManualPresenceStatus('away', DEFAULT_WORKSPACE_ID)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pointerdown'))
      window.dispatchEvent(new Event('keydown'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('別ワークスペースのアクティブタブでは offline 抑止しない', async () => {
    localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, JSON.stringify({
      other: { active: true, updatedAt: Date.now(), workspaceId: 'ws-2' },
    }))
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })
  })

  it('別ワークスペースの manual intent では current workspace の offline を抑止しない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    recordManualPresenceStatus('busy', 'ws-2')
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })
  })

  it('可視タブは heartbeat で active 記録を更新し続ける', async () => {
    vi.useFakeTimers()
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue(true)

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    const initial = JSON.parse(localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY) ?? '{}') as Record<string, { updatedAt: number }>
    const [tabId] = Object.keys(initial)
    expect(tabId).toBeDefined()
    if (!tabId) {
      vi.useRealTimers()
      return
    }
    const firstUpdatedAt = initial[tabId]?.updatedAt
    expect(firstUpdatedAt).toBeDefined()
    if (firstUpdatedAt === undefined) {
      vi.useRealTimers()
      return
    }

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    const next = JSON.parse(localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY) ?? '{}') as Record<string, { updatedAt: number }>
    expect(next[tabId]?.updatedAt ?? 0).toBeGreaterThan(firstUpdatedAt)
    vi.useRealTimers()
  })
})
