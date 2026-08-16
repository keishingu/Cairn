import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const { mockGetSession, mockGetSelectedWorkspace } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSelectedWorkspace: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}))

vi.mock('./env', () => ({ API_BASE_URL: 'https://api.example.com' }))

vi.mock('./workspace-selection', () => ({
  getSelectedWorkspaceId: mockGetSelectedWorkspace,
}))

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSelectedWorkspace.mockResolvedValue(null)
  })

  it('認証直後に渡されたセッションのBearerトークンを使う', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await import('./api-fetch')

    await apiFetch('/api/auth/setup', { method: 'POST', body: '{}' }, {
      access_token: 'fresh-access-token',
      user: { id: 'user-1' },
    } as Session)

    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockGetSelectedWorkspace).toHaveBeenCalledWith('user-1')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toBeInstanceOf(Headers)
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer fresh-access-token')
  })
})
