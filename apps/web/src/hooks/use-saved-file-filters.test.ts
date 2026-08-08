// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { DEFAULT_FILE_FILTER_CONDITIONS } from '@/lib/files/saved-file-filter'
import { savedFileFilterQueryKey, useSavedFileFilters } from './use-saved-file-filters'

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

describe('useSavedFileFilters', () => {
  beforeEach(() => mockFetch.mockReset())

  it('ユーザーの保存済みフィルターを取得する', async () => {
    mockFetch.mockResolvedValue(new Response('[]', { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useSavedFileFilters(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith('/api/files/filters')
  })

  it('作成したフィルターをキャッシュへ追加する', async () => {
    const created = {
      id: 'filter-1',
      name: '計画書',
      conditions: DEFAULT_FILE_FILTER_CONDITIONS,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    }
    mockFetch
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
    const { wrapper, queryClient } = makeWrapper()
    const { result } = renderHook(() => useSavedFileFilters(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        name: '計画書',
        conditions: DEFAULT_FILE_FILTER_CONDITIONS,
      })
    })

    expect(queryClient.getQueryData(savedFileFilterQueryKey)).toEqual([created])
  })
})
