// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'
import { projectGalleryHref, useMessageGallery } from './use-message-gallery'

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/locale-provider', () => ({
  useT: () => (message: string, values?: Record<string, string | number>) =>
    values ? Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message) : message,
}))

const mockFetch = vi.mocked(fetchWithAuth)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('projectGalleryHref', () => {
  test('プロジェクトのギャラリータブを開く URL を返す', () => {
    expect(projectGalleryHref('p1')).toBe('/projects?open=project-p1&tab=gallery')
  })
})

describe('useMessageGallery', () => {
  test('追加できたらトーストでギャラリーへの導線を出し、ギャラリーの一覧を取り直す', async () => {
    mockFetch.mockResolvedValue(json(201, { projectId: 'p1', addedCount: 2, alreadyAddedCount: 0 }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useMessageGallery(), { wrapper })

    const ok = await result.current.addImages('m1', ['a', 'b'])

    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/api/messages/m1/gallery', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fileIds: ['a', 'b'] }) }))
    expect(toast.success).toHaveBeenCalledWith('Added 2 photos to the gallery', { action: { label: 'Open', href: '/projects?open=project-p1&tab=gallery' } })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-gallery', 'p1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-gallery'] })
  })

  test('追加に失敗したらサーバーのエラーを出し、一覧は取り直さない', async () => {
    mockFetch.mockResolvedValue(json(403, { error: 'オリジナルを保存するには、残高のある有効な支援が必要です' }))
    const { wrapper, queryClient } = makeWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useMessageGallery(), { wrapper })

    const ok = await result.current.addImages('m1', ['a'])

    expect(ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('オリジナルを保存するには、残高のある有効な支援が必要です')
    expect(invalidate).not.toHaveBeenCalled()
  })

  test('追加状況の取得に失敗したらエラーを出して null を返す', async () => {
    mockFetch.mockRejectedValue(new Error('network'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useMessageGallery(), { wrapper })

    expect(await result.current.fetchStatus('m1')).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('Could not add to the gallery')
  })

  test('追加状況を返す', async () => {
    mockFetch.mockResolvedValue(json(200, { projectId: 'p1', addedFileIds: ['a'] }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useMessageGallery(), { wrapper })

    expect(await result.current.fetchStatus('m1')).toEqual({ projectId: 'p1', addedFileIds: ['a'] })
  })
})
