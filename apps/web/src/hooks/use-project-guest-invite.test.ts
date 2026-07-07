import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectGuestInvite } from './use-project-guest-invite'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper }
}

describe('useProjectGuestInvite', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('外部ゲスト招待リンクを生成する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      token: 'guest-token',
      url: 'https://example.com/invite/guest-token',
      expiresAt: '2026-08-01T00:00:00.000Z',
    }), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectGuestInvite('project-1', true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      token: 'guest-token',
      url: 'https://example.com/invite/guest-token',
      expiresAt: '2026-08-01T00:00:00.000Z',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/guest-invite',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
