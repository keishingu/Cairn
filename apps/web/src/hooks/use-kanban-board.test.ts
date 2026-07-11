import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import { projectQueryKeys } from './use-projects'
import { useKanbanBoard } from './use-kanban-board'

vi.mock('@/lib/fetch-with-auth')

const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

const STATUSES: ProjectStatusDto[] = [
  { id: 'todo', name: '未着手', color: '#94a3b8', sortOrder: '0' },
  { id: 'doing', name: '進行中', color: '#0ea5e9', sortOrder: '1' },
]

const PROJECTS: ProjectDto[] = [
  {
    id: 'project-1',
    title: '縦走計画',
    description: null,
    statusName: '未着手',
    statusColor: '#94a3b8',
    startDate: null,
    endDate: null,
    archived: false,
    memberCount: 2,
    memberNames: ['Kei'],
    memberAvatarUrls: [null],
    isOwner: true,
    isMember: true,
    taskCount: 2,
    completedTaskCount: 0,
    coverPhotoUrl: null,
    coverPhotoIdx: 0,
    location: null,
    placeId: null,
  },
  {
    id: 'project-2',
    title: 'アーカイブ済み',
    description: null,
    statusName: '進行中',
    statusColor: '#0ea5e9',
    startDate: null,
    endDate: null,
    archived: true,
    memberCount: 1,
    memberNames: ['Ebi'],
    memberAvatarUrls: [null],
    isOwner: false,
    isMember: true,
    taskCount: 1,
    completedTaskCount: 1,
    coverPhotoUrl: null,
    coverPhotoIdx: 0,
    location: null,
    placeId: null,
  },
]

describe('useKanbanBoard', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('アーカイブを除外しつつ statusFilter を適用する', async () => {
    mockFetch.mockImplementation(async (input) => {
      if (input === '/api/projects/statuses') return new Response(JSON.stringify(STATUSES), { status: 200 })
      if (input === '/api/projects') return new Response(JSON.stringify(PROJECTS), { status: 200 })
      throw new Error(`unexpected request: ${String(input)}`)
    })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useKanbanBoard({ statusFilter: ['未着手'] }), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statuses.map(status => status.name)).toEqual(['未着手'])
    expect(result.current.projects.map(project => project.id)).toEqual(['project-1'])
  })

  it('ステータス更新時に projects キャッシュを楽観更新する', async () => {
    mockFetch.mockImplementation((input, init) => {
      if (input === '/api/projects/statuses') {
        return Promise.resolve(new Response(JSON.stringify(STATUSES), { status: 200 }))
      }
      if (input === '/api/projects') {
        return Promise.resolve(new Response(JSON.stringify(PROJECTS), { status: 200 }))
      }
      if (input === '/api/projects/project-1' && init?.method === 'PATCH') {
        return new Promise(() => {})
      }
      throw new Error(`unexpected request: ${String(input)}`)
    })
    const { wrapper, queryClient } = makeWrapper()

    const { result } = renderHook(() => useKanbanBoard({}), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      result.current.updateStatus.mutate({ id: 'project-1', statusName: '進行中' })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(queryClient.getQueryData<ProjectDto[]>(projectQueryKeys.all)?.[0]?.statusName).toBe('進行中')
    expect(queryClient.getQueryData<ProjectDto[]>(projectQueryKeys.all)?.[0]?.statusColor).toBe('#0ea5e9')
  })
})
