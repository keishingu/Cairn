import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useWorkspaceInvites,
  useCreateWorkspaceInvite,
  useRevokeWorkspaceInvite,
  type WorkspaceInviteRecord,
} from './use-workspace-invites'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper, queryClient: qc }
}

const STUB_INVITES: WorkspaceInviteRecord[] = [
  {
    id: 'inv-1',
    token: 'token-1',
    url: 'https://example.com/invite/token-1',
    expiresAt: '2026-07-30T00:00:00.000Z',
    maxUses: null,
    useCount: 0,
    role: 'member',
    createdAt: '2026-07-01T00:00:00.000Z',
    createdByName: 'Alice',
  },
]

describe('useWorkspaceInvites', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('有効な招待リンク一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ invites: STUB_INVITES }), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkspaceInvites(true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_INVITES)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces/invites')
  })
})

describe('useCreateWorkspaceInvite', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('招待リンク生成後に一覧キャッシュを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      token: 'token-2',
      url: 'https://example.com/invite/token-2',
      expiresAt: null,
      role: 'member',
    }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateWorkspaceInvite(), { wrapper })
    act(() => { result.current.mutate({ expiresIn: '30d' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/workspaces/invites',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace-invites'] })
  })
})

describe('useRevokeWorkspaceInvite', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('招待リンクを無効化してキャッシュから取り除く', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['workspace-invites'], STUB_INVITES)

    const { result } = renderHook(() => useRevokeWorkspaceInvite(), { wrapper })
    act(() => { result.current.mutate('token-1') })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/workspaces/invites/token-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(queryClient.getQueryData(['workspace-invites'])).toEqual([])
  })
})
