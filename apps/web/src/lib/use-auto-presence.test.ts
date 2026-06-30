import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_HEADER } from '@/lib/workspace-cookie'
import { recordManualPresenceStatus, syncPresenceOfflineOnLogout, useAutoPresence } from './use-auto-presence'

const TAB_ACTIVITY_STORAGE_KEY = 'cairn:auto-presence:tabs'
const PRESENCE_INTENT_STORAGE_KEY = 'cairn:auto-presence:intent'
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
    vi.unstubAllGlobals()
  })

  it('ページを閉じる時に offline を keepalive 付きで送る', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('offline')

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

  it('keepalive offline は事前の現在値取得を待たない', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('offline')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'online', auto: false })

    renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', { keepalive: true })
      expect(readCurrentPresence).not.toHaveBeenCalled()
    })
  })

  it('keepalive offline は await 前に auto intent を保存する', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    let resolveUpdate: (value: 'offline') => void = () => {
      throw new Error('updateStatus promise was not created')
    }
    const updateStatus = vi.fn().mockImplementation(() => new Promise<'offline'>(resolve => {
      resolveUpdate = resolve
    }))

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(JSON.parse(localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY) ?? '{}')).toEqual({
      'ws-1': { status: 'offline', source: 'auto', workspaceId: 'ws-1' },
    })

    resolveUpdate('offline')
    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', { keepalive: true })
    })
  })

  it('非表示になったら offline を送る', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('offline')

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
    const updateStatus = vi.fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValue('online')

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
    const updateStatus = vi.fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValue('online')

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
    const updateStatus = vi.fn().mockResolvedValue('offline')

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
    const updateStatus = vi.fn().mockResolvedValue('offline')

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
    const updateStatus = vi.fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValue('online')

    renderHook(() => useAutoPresence({ status: 'offline', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('別タブで手動 offline を選んでいる間は重複する auto offline を送らない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    recordManualPresenceStatus('offline', DEFAULT_WORKSPACE_ID)
    const updateStatus = vi.fn().mockResolvedValue('offline')

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
    })

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('別タブで手動 busy を選んでいる間は stale な online 状態でも自動更新しない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    recordManualPresenceStatus('busy', DEFAULT_WORKSPACE_ID)
    const updateStatus = vi.fn().mockResolvedValue('offline')

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
    const updateStatus = vi.fn().mockResolvedValue('online')

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
    const updateStatus = vi.fn().mockResolvedValue('offline')

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
    const updateStatus = vi.fn().mockResolvedValue('offline')

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })
  })

  it('manual intent は workspace ごとに保持する', () => {
    recordManualPresenceStatus('busy', DEFAULT_WORKSPACE_ID)
    recordManualPresenceStatus('away', 'ws-2')

    expect(JSON.parse(localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY) ?? '{}')).toEqual({
      'ws-1': { status: 'busy', source: 'manual', workspaceId: 'ws-1', origin: 'explicit' },
      'ws-2': { status: 'away', source: 'manual', workspaceId: 'ws-2', origin: 'explicit' },
    })
  })

  it('可視タブは heartbeat で active 記録を更新し続ける', async () => {
    vi.useFakeTimers()
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('online')

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

  it('別 device で手動 busy の時は stale な online cache でも auto offline しない', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue('offline')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'busy', auto: false })

    renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(readCurrentPresence).toHaveBeenCalled()
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('server が busy を返した時は manual intent として保持する', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn().mockResolvedValue('busy')

    renderHook(() => useAutoPresence({ status: 'online', workspaceId: DEFAULT_WORKSPACE_ID, updateStatus }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })

    expect(JSON.parse(localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY) ?? '{}')).toEqual({
      'ws-1': { status: 'busy', source: 'manual', workspaceId: 'ws-1', origin: 'remote' },
    })
  })

  it('stale な remote manual intent は server が online に戻っていれば解除する', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    localStorage.setItem(PRESENCE_INTENT_STORAGE_KEY, JSON.stringify({
      'ws-1': { status: 'busy', source: 'manual', workspaceId: 'ws-1', origin: 'remote' },
    }))
    const updateStatus = vi.fn().mockResolvedValue('offline')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'online', auto: false })

    renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(readCurrentPresence).toHaveBeenCalled()
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })

    expect(JSON.parse(localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY) ?? '{}')).toEqual({
      'ws-1': { status: 'offline', source: 'auto', workspaceId: 'ws-1' },
    })
  })

  it('別 device で手動 offline の時は stale な online cache でも auto online しない', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('online')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'offline', auto: false })

    renderHook(() => useAutoPresence({
      status: 'offline',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(readCurrentPresence).toHaveBeenCalled()
      expect(updateStatus).not.toHaveBeenCalled()
    })
  })

  it('server が auto offline を返した時だけ local auto intent から online 復帰する', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    localStorage.setItem(PRESENCE_INTENT_STORAGE_KEY, JSON.stringify({
      'ws-1': { status: 'offline', source: 'auto', workspaceId: 'ws-1' },
    }))
    const updateStatus = vi.fn().mockResolvedValue('online')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'offline', auto: true })

    renderHook(() => useAutoPresence({
      status: 'offline',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    await waitFor(() => {
      expect(readCurrentPresence).toHaveBeenCalled()
      expect(updateStatus).toHaveBeenCalledWith('online', undefined)
    })
  })

  it('local intent が消えていても server が auto offline なら online 復帰する', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const updateStatus = vi.fn().mockResolvedValue('online')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'offline', auto: true })

    renderHook(() => useAutoPresence({
      status: 'offline',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    await waitFor(() => {
      expect(readCurrentPresence).toHaveBeenCalled()
      expect(updateStatus).toHaveBeenCalledWith('online', undefined)
    })
  })

  it('offline 反映待ちの間に復帰したら stale な offline 完了後に online を送り直す', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    let resolveOffline: (value: 'offline') => void = () => {
      throw new Error('offline update promise was not created')
    }
    const updateStatus = vi.fn()
      .mockImplementationOnce(() => new Promise<'offline'>(resolve => {
        resolveOffline = resolve
      }))
      .mockResolvedValueOnce('online')
    const readCurrentPresence = vi.fn().mockResolvedValue({ status: 'online', auto: false })

    renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus,
      readCurrentPresence,
    }))

    setVisibilityState('hidden')
    setHasFocus(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenNthCalledWith(1, 'offline', undefined)
    })

    setVisibilityState('visible')
    setHasFocus(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    resolveOffline('offline')
    await waitFor(() => {
      expect(updateStatus).toHaveBeenNthCalledWith(2, 'online')
    })
  })

  it('workspace 解決後に初期 online 同期をやり直す', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    localStorage.setItem(PRESENCE_INTENT_STORAGE_KEY, JSON.stringify({
      'ws-1': { status: 'offline', source: 'auto', workspaceId: 'ws-1' },
    }))
    const updateStatus = vi.fn().mockResolvedValue('online')
    const readCurrentPresence = vi.fn()
      .mockResolvedValueOnce({ status: 'offline', auto: true })
      .mockResolvedValue({ status: 'offline', auto: true })
    const initialProps: { workspaceId: string | null } = { workspaceId: null }

    const { rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string | null }) => useAutoPresence({
        status: 'offline',
        workspaceId,
        updateStatus,
        readCurrentPresence,
      }),
      { initialProps },
    )

    await waitFor(() => {
      expect(updateStatus).not.toHaveBeenCalled()
    })

    rerender({ workspaceId: DEFAULT_WORKSPACE_ID })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('online', undefined)
    })
  })

  it('local auto offline の復帰時は remote offline でも online に戻す', async () => {
    setVisibilityState('hidden')
    setHasFocus(false)
    const updateStatus = vi.fn()
      .mockResolvedValueOnce('offline')
      .mockResolvedValue('online')
    const readCurrentPresence = vi.fn()
      .mockResolvedValueOnce({ status: 'online', auto: false })
      .mockResolvedValue({ status: 'offline', auto: true })
    const initialProps: { status: 'online' | 'offline' } = { status: 'online' }

    const { rerender } = renderHook(
      ({ status }: { status: 'online' | 'offline' }) => useAutoPresence({
        status,
        workspaceId: DEFAULT_WORKSPACE_ID,
        updateStatus,
        readCurrentPresence,
      }),
      { initialProps },
    )

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('offline', undefined)
    })

    rerender({ status: 'offline' })
    setVisibilityState('visible')
    setHasFocus(true)

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith('online', undefined)
    })
  })

  it('duplicate tab でも別 tab id を採番して offline を誤送信しない', async () => {
    setVisibilityState('visible')
    setHasFocus(true)
    const firstUpdateStatus = vi.fn().mockResolvedValue('online')
    const secondUpdateStatus = vi.fn().mockResolvedValue('online')

    const firstTab = renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus: firstUpdateStatus,
    }))

    const firstTabId = Object.keys(JSON.parse(localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY) ?? '{}'))[0]
    expect(firstTabId).toBeDefined()
    if (!firstTabId) {
      return
    }

    const clonedSessionStorage = sessionStorage.getItem(`${TAB_ACTIVITY_STORAGE_KEY}:id`)
    expect(clonedSessionStorage).toBeTruthy()

    firstTab.unmount()
    localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, JSON.stringify({
      [firstTabId]: { active: true, updatedAt: Date.now(), workspaceId: DEFAULT_WORKSPACE_ID },
    }))
    sessionStorage.clear()
    if (clonedSessionStorage) {
      sessionStorage.setItem(`${TAB_ACTIVITY_STORAGE_KEY}:id`, clonedSessionStorage)
    }

    renderHook(() => useAutoPresence({
      status: 'online',
      workspaceId: DEFAULT_WORKSPACE_ID,
      updateStatus: secondUpdateStatus,
    }))

    const recordKeys = Object.keys(JSON.parse(localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY) ?? '{}'))
    expect(recordKeys).toHaveLength(2)
    expect(new Set(recordKeys).size).toBe(2)

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => {
      expect(secondUpdateStatus).not.toHaveBeenCalledWith('offline', { keepalive: true })
    })
  })

  it('logout 前に keepalive 付き offline PATCH を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'offline' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await syncPresenceOfflineOnLogout(DEFAULT_WORKSPACE_ID)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/me')
    expect(init.method).toBe('PATCH')
    expect(init.keepalive).toBe(true)
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(String(init.body))).toEqual({ status: 'offline', auto: true })
    expect(new Headers(init.headers).get(WORKSPACE_HEADER)).toBe(DEFAULT_WORKSPACE_ID)
  })
})
