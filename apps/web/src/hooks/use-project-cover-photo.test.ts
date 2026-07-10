import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectDto } from '@/app/api/projects/route'
import type { PlacePhoto } from '@/app/api/places/photos/route'
import { projectQueryKeys } from './use-projects'
import { useApplyPlacePhoto, useClearProjectCoverPhoto, usePlacePhotos } from './use-project-cover-photo'

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
    title: '涸沢',
    description: null,
    statusName: null,
    statusColor: null,
    startDate: null,
    endDate: null,
    archived: false,
    memberCount: 1,
    memberNames: ['Kei'],
    memberAvatarUrls: [null],
    isOwner: true,
    isMember: true,
    taskCount: 0,
    completedTaskCount: 0,
    coverPhotoUrl: 'https://example.com/old.jpg',
    coverPhotoIdx: 0,
    location: null,
    placeId: 'place-1',
  },
]

const PHOTOS: PlacePhoto[] = [
  { photoName: 'places/abc/photos/1', thumbnailUri: 'https://example.com/thumb.jpg', attributions: [] },
]

describe('useProjectCoverPhoto', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('placeId があるときだけ候補写真を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(PHOTOS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePlacePhotos('place-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PHOTOS)
    expect(mockFetch).toHaveBeenCalledWith('/api/places/photos?placeId=place-1')
  })

  it('デフォルト画像へ戻したとき projects キャッシュを更新する', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(projectQueryKeys.all, PROJECTS)

    const { result } = renderHook(() => useClearProjectCoverPhoto('project-1'), { wrapper })

    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryData<ProjectDto[]>(projectQueryKeys.all)?.[0]?.coverPhotoUrl).toBeNull()
  })

  it('場所写真を適用したとき projects キャッシュを更新する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ coverPhotoUrl: 'https://example.com/new.jpg' }), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(projectQueryKeys.all, PROJECTS)

    const { result } = renderHook(() => useApplyPlacePhoto('project-1'), { wrapper })

    await act(async () => {
      result.current.mutate('places/abc/photos/1')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryClient.getQueryData<ProjectDto[]>(projectQueryKeys.all)?.[0]?.coverPhotoUrl).toBe('https://example.com/new.jpg')
  })
})
