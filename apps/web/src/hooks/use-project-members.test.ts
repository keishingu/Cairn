import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useWorkspaceMembers,
  useProjectMembers,
  useWorkspaceMembersForInvite,
  useWorkspaceInvites,
  useCreateWorkspaceInvite,
  useRevokeWorkspaceInvite,
  useCreateProjectGuestInvite,
  useAddProjectMember,
  useRemoveProjectMember,
} from './use-project-members'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectMemberDto } from '@/app/api/projects/[id]/members/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { WorkspaceInviteDto } from './use-project-members'

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
  { userId: 'u1', displayName: 'Alice', email: 'alice@example.com', avatarUrl: null, role: 'owner', membershipStatus: 'active', profileAttributes: [], joinedAt: '2026-01-01', projectCount: 1 },
  { userId: 'u3', displayName: 'Carol', email: 'carol@example.com', avatarUrl: null, role: 'member', membershipStatus: 'active', profileAttributes: [], joinedAt: '2026-01-03', projectCount: 0 },
]

const STUB_INVITES: WorkspaceInviteDto[] = [
  {
    id: 'invite-1',
    token: 'token-1',
    url: 'https://example.com/invite/token-1',
    expiresAt: '2026-07-31T00:00:00.000Z',
    maxUses: null,
    useCount: 0,
    role: 'member',
    createdAt: '2026-07-01T00:00:00.000Z',
    createdByName: 'Alice',
  },
]

describe('useWorkspaceMembers', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('ワークスペースメンバー一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_WS_MEMBERS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkspaceMembers(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_WS_MEMBERS)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces/members')
  })
})

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

describe('workspace invite hooks', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('useWorkspaceInvites が招待一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ invites: STUB_INVITES }), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkspaceInvites(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_INVITES)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces/invites')
  })

  it('useCreateWorkspaceInvite が招待リンク生成後に一覧を再取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      token: 'token-2',
      url: 'https://example.com/invite/token-2',
      expiresAt: null,
      role: 'member',
    }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateWorkspaceInvite(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ expiresIn: '30d' })
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/workspaces/invites',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace-invites'] })
  })

  it('useRevokeWorkspaceInvite がキャッシュから対象招待を外す', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['workspace-invites'], STUB_INVITES)
    const { result } = renderHook(() => useRevokeWorkspaceInvite(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('token-1')
    })

    const cached = queryClient.getQueryData<WorkspaceInviteDto[]>(['workspace-invites'])
    expect(cached).toEqual([])
  })

  it('useRevokeWorkspaceInvite は未読込キャッシュを空配列で seed しない', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const { result } = renderHook(() => useRevokeWorkspaceInvite(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('token-1')
    })

    expect(queryClient.getQueryData(['workspace-invites'])).toBeUndefined()
  })

  it('useCreateProjectGuestInvite が guest 招待リンク生成後に一覧を再取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      token: 'guest-token',
      url: 'https://example.com/invite/guest-token',
      expiresAt: '2026-07-31T00:00:00.000Z',
    }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCreateProjectGuestInvite('project-1'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/guest-invite',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace-invites'] })
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
