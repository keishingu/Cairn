import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useCreateProjectStatus, useDeleteProjectStatus, useUpdateProjectStatus } from './use-project-status-management'
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

describe('useProjectStatusManagement', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('新規ステータス追加後に statuses クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateProjectStatus(), { wrapper })
    act(() => { result.current.mutate({ name: 'レビュー', color: '#F59E0B' }) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/statuses',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'レビュー', color: '#F59E0B' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['statuses'] })
  })

  it('ステータス更新時に PATCH を送り statuses クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateProjectStatus('status-1'), { wrapper })
    act(() => { result.current.mutate({ name: '完了', color: '#10B981' }) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/statuses/status-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: '完了', color: '#10B981' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['statuses'] })
  })

  it('ステータス削除時に DELETE を送り statuses クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteProjectStatus('status-1'), { wrapper })
    act(() => { result.current.mutate() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/statuses/status-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['statuses'] })
  })
})
