import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAccountSettings, useUpdateAccountDisplayName, useUploadAccountAvatar } from './use-account-settings'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { processImageForUpload } from '@/lib/process-image'

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/lib/process-image')

const mockFetch = vi.mocked(fetchWithAuth)
const mockProcessImageForUpload = vi.mocked(processImageForUpload)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper, queryClient: qc }
}

describe('useAccountSettings', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockProcessImageForUpload.mockReset()
  })

  it('/api/me から現在ユーザーを取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      id: 'user-1',
      email: 'kei@example.com',
      displayName: 'Kei',
      avatarUrl: null,
      wsRole: 'owner',
      workspaceId: 'ws-1',
    }), { status: 200 }))

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAccountSettings(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.displayName).toBe('Kei')
    expect(mockFetch).toHaveBeenCalledWith('/api/me')
  })
})

describe('useUpdateAccountDisplayName', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockProcessImageForUpload.mockReset()
  })

  it('成功時にプロフィール更新を送り関連クエリを invalidate する', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateAccountDisplayName(), { wrapper })
    act(() => { result.current.mutate('えびちゃん') })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'えびちゃん' }),
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace-members'] })
  })
})

describe('useUploadAccountAvatar', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockProcessImageForUpload.mockReset()
  })

  it('画像を前処理してからアバターAPIに送る', async () => {
    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })
    const processed = new File(['optimized'], 'optimized.jpg', { type: 'image/jpeg' })
    mockProcessImageForUpload.mockResolvedValue({
      file: processed,
      takenAt: null,
      latitude: null,
      longitude: null,
    })
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))

    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUploadAccountAvatar(), { wrapper })
    act(() => { result.current.mutate(file) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockProcessImageForUpload).toHaveBeenCalledWith(file)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/me/avatar',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspace-members'] })
  })

  it('processImageForUpload の失敗をユーザー向けメッセージに変換する', async () => {
    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })
    mockProcessImageForUpload.mockRejectedValue(new Error('boom'))

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUploadAccountAvatar(), { wrapper })
    act(() => { result.current.mutate(file) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('画像の準備に失敗しました。別の写真でお試しください')
  })
})
