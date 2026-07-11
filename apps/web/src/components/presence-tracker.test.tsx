import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import { PresenceTracker, derivePresenceStatus, parsePresenceSessions, prunePresenceSessions, sendPresenceStatusUpdate, updatePresenceSessions } from './presence-tracker'

const mockFetchWithAuth = vi.fn()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}))

const BASE_USER: CurrentUserDto = {
  id: 'user-1',
  displayName: '山田 太郎',
  avatarUrl: null,
  email: 'taro@example.com',
  bio: null,
  status: 'offline',
  statusMessage: null,
  wsRole: 'member',
}

function renderTracker(me: CurrentUserDto) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['me'], me)
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <PresenceTracker />
    </QueryClientProvider>,
  )
  return { ...rendered, queryClient }
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: hidden ? 'hidden' : 'visible',
  })
}

describe('presence helpers', () => {
  it('壊れた localStorage 値を無視する', () => {
    expect(parsePresenceSessions('{oops')).toEqual({})
  })

  it('古いセッションを落として status を導出する', () => {
    const now = 120_000
    const sessions = prunePresenceSessions(
      {
        active: { lastActiveAt: now - 5_000, lastSeenAt: now - 5_000 },
        idle: { lastActiveAt: now - 70_000, lastSeenAt: now - 70_000 },
        stale: { lastActiveAt: now - 80_000, lastSeenAt: now - 80_000 },
      },
      now,
    )

    expect(sessions).toEqual({
      active: { lastActiveAt: now - 5_000, lastSeenAt: now - 5_000 },
      idle: { lastActiveAt: now - 70_000, lastSeenAt: now - 70_000 },
    })
    expect(derivePresenceStatus(sessions, now)).toBe('online')
    expect(derivePresenceStatus({ idle: { lastActiveAt: now - 70_000, lastSeenAt: now - 70_000 } }, now)).toBe('away')
    expect(derivePresenceStatus({ stale: { lastActiveAt: now - 80_000, lastSeenAt: now - 80_000 } }, now)).toBe('offline')
  })

  it('heartbeat 中は最終活動時刻を維持して idle 遷移を邪魔しない', () => {
    const now = 120_000
    expect(
      updatePresenceSessions(
        {
          self: { lastActiveAt: now - 70_000, lastSeenAt: now - 10_000 },
        },
        'self',
        now,
        { preserveActivity: true },
      ),
    ).toEqual({
      self: { lastActiveAt: now - 70_000, lastSeenAt: now },
    })
  })

  it('heartbeat で lastSeenAt を更新して visible session を stale 扱いしない', () => {
    const now = 120_000
    const sessions = updatePresenceSessions(
      {
        self: { lastActiveAt: now - 70_000, lastSeenAt: now - 70_000 },
      },
      'self',
      now,
      { preserveActivity: true },
    )

    expect(prunePresenceSessions(sessions, now + 15_000)).toEqual({
      self: { lastActiveAt: now - 70_000, lastSeenAt: now },
    })
    expect(derivePresenceStatus(sessions, now)).toBe('away')
  })
})

describe('PresenceTracker', () => {
  beforeEach(() => {
    setDocumentHidden(false)
    window.localStorage.clear()
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('表示中に offline から online へ更新する', async () => {
    renderTracker(BASE_USER)

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/me',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'online' }),
        }),
      )
    })
  })

  it('hidden なら offline を keepalive 付きで送る', async () => {
    setDocumentHidden(true)
    renderTracker({ ...BASE_USER, status: 'online' })

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/me',
        expect.objectContaining({
          method: 'PATCH',
          keepalive: true,
          body: JSON.stringify({ status: 'offline' }),
        }),
      )
    })
  })

  it('sign out 用 helper は offline keepalive を送る', async () => {
    await sendPresenceStatusUpdate('offline', { keepalive: true })

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        method: 'PATCH',
        keepalive: true,
        body: JSON.stringify({ status: 'offline' }),
      }),
    )
  })

  it('busy は自動更新しない', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T00:00:00Z'))
    renderTracker({ ...BASE_USER, status: 'busy' })

    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })

    expect(mockFetchWithAuth).not.toHaveBeenCalled()
  })

  it('status 更新で effect が再実行されても idle session を online に戻さない', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(80_000)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-session')
    window.localStorage.setItem('cairn-presence-sessions', JSON.stringify({
      'test-session': {
        lastActiveAt: 10_000,
        lastSeenAt: 80_000,
      },
    }))
    renderTracker({ ...BASE_USER, status: 'online' })

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1)
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'away' }),
      }),
    )

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem('cairn-presence-sessions') || '{}')).toMatchObject({
      'test-session': {
        lastActiveAt: 10_000,
        lastSeenAt: expect.any(Number),
      },
    })
  })

  it('pagehide の offline keepalive は進行中 PATCH があっても送る', async () => {
    let resolveOnline: ((value: Response) => void) | null = null
    const onlineRequest = new Promise<Response>((resolve) => {
      resolveOnline = resolve
    })
    mockFetchWithAuth
      .mockImplementationOnce(() => onlineRequest)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    renderTracker(BASE_USER)

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledTimes(1)
    })

    setDocumentHidden(true)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledTimes(2)
    })
    expect(mockFetchWithAuth).toHaveBeenNthCalledWith(
      2,
      '/api/me',
      expect.objectContaining({
        method: 'PATCH',
        keepalive: true,
        body: JSON.stringify({ status: 'offline' }),
      }),
    )

    resolveOnline?.(new Response('{}', { status: 200 }))
    await act(async () => {
      await onlineRequest
    })
  })
})
