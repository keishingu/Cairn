import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectFiles } from './use-project-files'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { ProjectFileDto } from '@/app/api/projects/[id]/files/route'

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

const STUB_FILES: ProjectFileDto[] = [
  { id: 'f1', fileName: 'doc.pdf', mimeType: 'application/pdf', fileSize: 1024, fileType: 'file', uploaderName: 'ユーザー', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'f2', fileName: 'sheet.xlsx', mimeType: 'application/vnd.openxmlformats', fileSize: 2048, fileType: 'file', uploaderName: 'ユーザー', createdAt: '2026-01-02T00:00:00Z' },
]

describe('useProjectFiles', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('/api/projects/:id/files からファイル一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_FILES), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectFiles('p1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_FILES)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/files')
  })

  it('取得失敗時に isError が true になる', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectFiles('p1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('deleteMutation がファイルを削除して project-files クエリを invalidate する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['project-files', 'p1'], STUB_FILES)
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useProjectFiles('p1'), { wrapper })
    act(() => { result.current.deleteMutation.mutate('f1') })
    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/attachments/f1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-files', 'p1'] })
  })
})
