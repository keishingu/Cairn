import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useProjectMembers,
  useWorkspaceMembersForInvite,
  useAddProjectMember,
  useRemoveProjectMember,
} from './use-project-members'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

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

const STUB_MEMBERS: ProjectMemberDto[] = [
  { userId: 'u1', displayName: 'Alice', email: 'alice@example.com', avatarUrl: null, role: 'leader', attendance: 'attending', addedAt: '2026-01-01' },
  { userId: 'u2', displayName: 'Bob', email: 'bob@example.com', avatarUrl: null, role: 'member', attendance: 'attending', addedAt: '2026-01-02' },
]

const STUB_WS_MEMBERS: WorkspaceMemberDto[] = [
  { userId: 'u1', displayName: 'Alice', email: 'alice@example.com', avatarUrl: null, role: 'owner', joinedAt: '2026-01-01', projectCount: 1 },
  { userId: 'u3', displayName: 'Carol', email: 'carol@example.com', avatarUrl: null, role: 'member', joinedAt: '2026-01-03', projectCount: 0 },
]

describe('useProjectMembers', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('/api/projects/:id/members からメンバー一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_MEMBERS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectMembers('p1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_MEMBERS)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/members')
  })
})

describe('useWorkspaceMembersForInvite', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('enabled=true のときワークスペースメンバーを取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_WS_MEMBERS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkspaceMembersForInvite(true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_WS_MEMBERS)
  })

  it('enabled=false のときフェッチしない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useWorkspaceMembersForInvite(false), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useAddProjectMember', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('メンバーを追加してキャッシュに追記する', async () => {
    const newMember: ProjectMemberDto = { userId: 'u3', displayName: 'Carol', email: 'carol@example.com', avatarUrl: null, role: 'member', attendance: 'attending', addedAt: '2026-01-03' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify([newMember]), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['project-members', 'p1'], STUB_MEMBERS)

    const { result } = renderHook(() => useAddProjectMember('p1'), { wrapper })
    act(() => { result.current.mutate({ userIds: ['u3'], role: 'member' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/p1/members',
      expect.objectContaining({ method: 'POST' }),
    )
    const cached = queryClient.getQueryData<ProjectMemberDto[]>(['project-members', 'p1'])
    expect(cached?.some(m => m.userId === 'u3')).toBe(true)
  })

  it('エラーレスポンスのときエラーメッセージを throw する', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '追加エラー' }), { status: 400 }),
    )
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAddProjectMember('p1'), { wrapper })
    act(() => { result.current.mutate({ userIds: ['u3'], role: 'member' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('追加エラー')
  })
})

describe('useRemoveProjectMember', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('メンバーを削除してキャッシュから取り除く', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['project-members', 'p1'], STUB_MEMBERS)

    const { result } = renderHook(() => useRemoveProjectMember('p1'), { wrapper })
    act(() => { result.current.mutate('u2') })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/p1/members/u2',
      expect.objectContaining({ method: 'DELETE' }),
    )
    const cached = queryClient.getQueryData<ProjectMemberDto[]>(['project-members', 'p1'])
    expect(cached?.some(m => m.userId === 'u2')).toBe(false)
    expect(cached?.some(m => m.userId === 'u1')).toBe(true)
  })
})
