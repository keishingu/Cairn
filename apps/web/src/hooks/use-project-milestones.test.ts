import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectMilestones } from './use-project-milestones'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

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

const STUB_MILESTONES: MilestoneDto[] = [
  {
    id: 'm1',
    projectId: 'p1',
    title: '高所順応',
    description: null,
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    completed: false,
    channelId: 'c1',
  },
]

describe('useProjectMilestones', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('/api/projects/:id/milestones からマイルストーン一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_MILESTONES), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectMilestones('p1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(STUB_MILESTONES)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/milestones')
  })

  it('createMutation が作成後にマイルストーンとチャンネル一覧を invalidate する', async () => {
    const created: MilestoneDto = { ...STUB_MILESTONES[0]!, id: 'm2', channelId: 'c2', title: '登頂日' }
    mockFetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/milestones') && init && 'method' in init && init.method === 'POST') {
        return new Response(JSON.stringify(created), { status: 201 })
      }
      return new Response(JSON.stringify(STUB_MILESTONES), { status: 200 })
    })
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProjectMilestones('p1'), { wrapper })

    await act(async () => {
      await result.current.createMutation.mutateAsync({ title: '登頂日' })
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/p1/milestones',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-milestones', 'p1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-channels'] })
  })

  it('patchMutation が更新後にキャッシュを差し替える', async () => {
    const updated: MilestoneDto = { ...STUB_MILESTONES[0]!, completed: true }
    mockFetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/m1') && init && 'method' in init && init.method === 'PATCH') {
        return new Response(JSON.stringify(updated), { status: 200 })
      }
      return new Response(JSON.stringify([updated]), { status: 200 })
    })
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['project-milestones', 'p1'], STUB_MILESTONES)
    const { result } = renderHook(() => useProjectMilestones('p1'), { wrapper })

    await act(async () => {
      await result.current.patchMutation.mutateAsync({ id: 'm1', input: { completed: true } })
    })

    expect(queryClient.getQueryData<MilestoneDto[]>(['project-milestones', 'p1'])?.[0]?.completed).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/p1/milestones/m1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('deleteMutation が削除後にキャッシュから取り除く', async () => {
    mockFetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/m1') && init && 'method' in init && init.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify(STUB_MILESTONES), { status: 200 })
    })
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['project-milestones', 'p1'], STUB_MILESTONES)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProjectMilestones('p1'), { wrapper })

    await act(async () => {
      await result.current.deleteMutation.mutateAsync('m1')
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/p1/milestones/m1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-milestones', 'p1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-channels'] })
  })
})
