import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import { projectQueryKeys, useProjects } from './use-projects'

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

const PROJECTS: ProjectDto[] = [
  {
    id: 'project-1',
    title: '北アルプス遠征',
    description: null,
    statusName: '進行中',
    statusColor: '#0ea5e9',
    startDate: null,
    endDate: null,
    archived: false,
    memberCount: 2,
    memberNames: ['Kei', 'Ebi'],
    memberAvatarUrls: [null, null],
    isOwner: true,
    isMember: true,
    taskCount: 4,
    completedTaskCount: 1,
    coverPhotoUrl: null,
    coverPhotoIdx: 0,
    location: null,
    placeId: null,
  },
]

describe('useProjects', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('/api/projects からプロジェクト一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(PROJECTS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PROJECTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects')
  })

  it('キャッシュが fresh なら再フェッチしない', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(projectQueryKeys.all, PROJECTS)
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useProjects(), { wrapper: Wrapper })

    expect(result.current.data).toEqual(PROJECTS)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
