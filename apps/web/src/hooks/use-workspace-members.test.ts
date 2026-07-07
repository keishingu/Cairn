import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useWorkspaceMembers } from './use-workspace-members'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

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

const STUB_WS_MEMBERS: WorkspaceMemberDto[] = [
  { userId: 'u1', displayName: 'Alice', email: 'alice@example.com', avatarUrl: null, role: 'owner', joinedAt: '2026-01-01', projectCount: 1 },
  { userId: 'u3', displayName: 'Carol', email: 'carol@example.com', avatarUrl: null, role: 'member', joinedAt: '2026-01-03', projectCount: 0 },
]

describe('useWorkspaceMembers', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('ワークスペースメンバーを取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_WS_MEMBERS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkspaceMembers(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_WS_MEMBERS)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces/members')
  })

  it('enabled=false のときフェッチしない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useWorkspaceMembers(false), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
