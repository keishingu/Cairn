import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import { PresenceTracker, derivePresenceStatus, parsePresenceSessions, prunePresenceSessions, updatePresenceSessions } from './presence-tracker'

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
  return render(
    <QueryClientProvider client={queryClient}>
      <PresenceTracker />
    </QueryClientProvider>,
  )
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
        active: { lastActiveAt: now - 5_000 },
        idle: { lastActiveAt: now - 70_000 },
        stale: { lastActiveAt: now - 80_000 },
      },
      now,
    )

    expect(sessions).toEqual({
      active: { lastActiveAt: now - 5_000 },
      idle: { lastActiveAt: now - 70_000 },
    })
    expect(derivePresenceStatus(sessions, now)).toBe('online')
    expect(derivePresenceStatus({ idle: { lastActiveAt: now - 70_000 } }, now)).toBe('away')
    expect(derivePresenceStatus({ stale: { lastActiveAt: now - 80_000 } }, now)).toBe('offline')
  })

  it('heartbeat 中は最終活動時刻を維持して idle 遷移を邪魔しない', () => {
    const now = 120_000
    expect(
      updatePresenceSessions(
        {
          self: { lastActiveAt: now - 70_000 },
        },
        'self',
        now,
        { preserveActivity: true },
      ),
    ).toEqual({
      self: { lastActiveAt: now - 70_000 },
    })
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

  it('busy は自動更新しない', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T00:00:00Z'))
    renderTracker({ ...BASE_USER, status: 'busy' })

    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })

    expect(mockFetchWithAuth).not.toHaveBeenCalled()
  })
})
