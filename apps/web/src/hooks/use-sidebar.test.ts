import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useSidebarCurrentUser, useSidebarProjects, useSidebarWorkspace, useSidebarWorkspaceList } from './use-sidebar'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceListItemDto } from '@/app/api/workspaces/list/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'

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

const STUB_WORKSPACE: WorkspaceDto = {
  id: 'ws1',
  name: 'Cairn',
  slug: 'cairn',
  description: 'workspace',
  logoUrl: null,
}

const STUB_WORKSPACE_LIST: WorkspaceListItemDto[] = [
  { id: 'ws1', name: 'Cairn', slug: 'cairn', logoUrl: null, role: 'owner' },
  { id: 'ws2', name: 'Camp', slug: 'camp', logoUrl: 'https://example.com/logo.png', role: 'member' },
]

const STUB_PROJECTS: ProjectDto[] = [
  {
    id: 'p1',
    title: 'Alpha',
    description: null,
    statusName: null,
    statusColor: null,
    startDate: null,
    endDate: null,
    archived: false,
    memberCount: 3,
    memberNames: ['Kei'],
    memberAvatarUrls: [null],
    taskCount: 2,
    completedTaskCount: 1,
    isOwner: true,
    isMember: true,
    coverPhotoIdx: 1,
    coverPhotoUrl: null,
    location: null,
    placeId: null,
  },
]

const STUB_ME: CurrentUserDto = {
  id: 'u1',
  email: 'user@example.com',
  displayName: 'Kei',
  avatarUrl: null,
  bio: null,
  status: 'online',
  statusMessage: null,
  wsRole: 'owner',
}

describe('useSidebar data hooks', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('ワークスペースを取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_WORKSPACE), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useSidebarWorkspace(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_WORKSPACE)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces')
  })

  it('ワークスペース一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_WORKSPACE_LIST), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useSidebarWorkspaceList(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_WORKSPACE_LIST)
    expect(mockFetch).toHaveBeenCalledWith('/api/workspaces/list')
  })

  it('ピン留め用のプロジェクト一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_PROJECTS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useSidebarProjects(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_PROJECTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects')
  })
})

describe('useSidebarCurrentUser', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('現在ユーザーを取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_ME), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useSidebarCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_ME)
    expect(mockFetch).toHaveBeenCalledWith('/api/me')
  })

  it('statusMutation が me キャッシュの status を更新する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['me'], STUB_ME)
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const { result } = renderHook(() => useSidebarCurrentUser(), { wrapper })

    act(() => {
      result.current.statusMutation.mutate('busy')
    })

    await waitFor(() => expect(result.current.statusMutation.isSuccess).toBe(true))
    expect(queryClient.getQueryData<CurrentUserDto>(['me'])?.status).toBe('busy')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'busy' }) }),
    )
  })

  it('statusMessageMutation が me キャッシュの statusMessage を更新する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['me'], STUB_ME)
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const { result } = renderHook(() => useSidebarCurrentUser(), { wrapper })

    act(() => {
      result.current.statusMessageMutation.mutate('離席中')
    })

    await waitFor(() => expect(result.current.statusMessageMutation.isSuccess).toBe(true))
    expect(queryClient.getQueryData<CurrentUserDto>(['me'])?.statusMessage).toBe('離席中')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ statusMessage: '離席中' }) }),
    )
  })
})
