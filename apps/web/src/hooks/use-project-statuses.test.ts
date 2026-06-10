import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectStatuses } from './use-project-statuses'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper, queryClient: qc }
}

const STUB_STATUSES: ProjectStatusDto[] = [
  { id: 's1', name: '実施中', color: '#8B5CF6', workspaceId: 'ws-1', order: 0 },
  { id: 's2', name: '完了', color: '#10B981', workspaceId: 'ws-1', order: 1 },
]

describe('useProjectStatuses', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('/api/projects/statuses からステータス一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_STATUSES), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectStatuses(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_STATUSES)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/statuses')
  })

  it('staleTime=Infinity のとき、キャッシュに既にデータがある場合はフェッチしない', async () => {
    // staleTime=0（デフォルト）のままだとキャッシュ有りでも background refetch が走るため Infinity を指定
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    qc.setQueryData(['statuses'], STUB_STATUSES)
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useProjectStatuses(), { wrapper: Wrapper })
    expect(result.current.data).toEqual(STUB_STATUSES)
    expect(result.current.isSuccess).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
