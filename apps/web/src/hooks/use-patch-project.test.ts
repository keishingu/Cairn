import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { usePatchProject, useDeleteProject } from './use-patch-project'
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

describe('usePatchProject', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('成功時に PATCH リクエストを送り projects クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePatchProject('proj-1'), { wrapper })
    act(() => { result.current.mutate({ title: '新タイトル' }) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: '新タイトル' }) }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
  })

  it('レスポンスが ok=false のときサーバーのエラーメッセージを throw する', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '更新エラー' }), { status: 400 }),
    )
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => usePatchProject('proj-1'), { wrapper })
    act(() => { result.current.mutate({ title: '失敗' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('更新エラー')
  })
})

describe('useDeleteProject', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('成功時に DELETE リクエストを送り projects クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteProject('proj-1'), { wrapper })
    act(() => { result.current.mutate() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
  })

  it('レスポンスが ok=false のとき error を throw する', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '削除エラー' }), { status: 400 }),
    )
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteProject('proj-1'), { wrapper })
    act(() => { result.current.mutate() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('削除エラー')
  })
})
