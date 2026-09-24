import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from '@/hooks/use-current-user'
import { QueryProvider } from './query-provider'

const { authListeners } = vi.hoisted(() => ({
  authListeners: [] as Array<(event: string) => void>,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        authListeners.push(callback)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  }),
}))

vi.mock('@/lib/posthog', () => ({
  isPostHogConfigured: false,
  posthog: { reset: vi.fn() },
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockFetch = vi.mocked(fetchWithAuth)

const STUB_USER: CurrentUserDto = {
  id: 'user-1',
  email: 'taro@example.com',
  displayName: '山田 太郎',
  avatarUrl: null,
  bio: null,
  status: 'online',
  statusMessage: null,
  wsRole: 'owner',
  aiNudgesEnabled: true,
  theme: 'system',
  accentId: 'emerald',
  calendarWeekStart: 'sunday',
}

let seenClient: QueryClient | undefined

function SessionUser() {
  const queryClient = useQueryClient()
  seenClient = queryClient
  const { data, isError, isPending } = useCurrentUser()
  if (isError) return <div>error</div>
  if (isPending) return <div>loading</div>
  return <div>{data?.displayName ?? 'empty'}</div>
}

describe('QueryProvider', () => {
  beforeEach(() => {
    authListeners.length = 0
    seenClient = undefined
    mockFetch.mockReset()
  })

  it('ログアウトで現在ユーザーのキャッシュを破棄する', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(STUB_USER), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))

    const view = render(
      <QueryProvider>
        <SessionUser key="before-logout" />
      </QueryProvider>,
    )

    expect(await screen.findByText('山田 太郎')).toBeInTheDocument()
    expect(authListeners).toHaveLength(1)

    authListeners.forEach((listener) => listener('SIGNED_OUT'))

    expect(seenClient?.getQueryData(CURRENT_USER_QUERY_KEY)).toBeUndefined()

    view.rerender(
      <QueryProvider>
        <SessionUser key="after-logout" />
      </QueryProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByText('山田 太郎')).toBeNull()
      expect(screen.getByText(/loading|error|empty/)).toBeInTheDocument()
    })
  })
})
