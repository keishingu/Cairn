// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { useAiConversationMessages, useAiConversations, useCreateAiConversation } from './use-ai-conversations'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { toast } from '@/lib/toast'

vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockFetchWithAuth = vi.mocked(fetchWithAuth)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  }
}

describe('AIアシスタントの会話の取得', () => {
  it('会話の一覧を取得できなければ、エラーの中身を会話として扱わずエラーにする（5xx は決まった文言）', async () => {
    mockFetchWithAuth.mockResolvedValue(json({ error: 'Internal server error' }, 500))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useAiConversations(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error?.message).toBe('会話の一覧を読み込めませんでした')
  })

  it('会話の中身を取得できなければ、理由が無いときは決まった文言のエラーにする', async () => {
    mockFetchWithAuth.mockResolvedValue(new Response('not json', { status: 502 }))
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useAiConversationMessages('c1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('会話を読み込めませんでした')
  })

  it('会話を開いていないときは取得しない', () => {
    mockFetchWithAuth.mockClear()
    const { Wrapper } = wrapper()
    renderHook(() => useAiConversationMessages(null), { wrapper: Wrapper })
    expect(mockFetchWithAuth).not.toHaveBeenCalled()
  })

  it('新しい会話を作れたら一覧の先頭に足し、作れなければトーストで知らせる', async () => {
    const { Wrapper, queryClient } = wrapper()
    queryClient.setQueryData(['ai-conversations'], [{ id: 'old', title: '前の会話', createdAt: '2026-10-28T00:00:00Z' }])
    const onCreated = vi.fn()
    const { result } = renderHook(() => useCreateAiConversation(onCreated), { wrapper: Wrapper })

    mockFetchWithAuth.mockResolvedValue(json({ id: 'new', title: null, createdAt: '2026-10-29T00:00:00Z' }))
    await act(async () => { await result.current.mutateAsync() })
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }))
    expect((queryClient.getQueryData(['ai-conversations']) as Array<{ id: string }>).map(item => item.id)).toEqual(['new', 'old'])

    mockFetchWithAuth.mockResolvedValue(json({ error: 'クレジットが不足しています' }, 402))
    await act(async () => { await result.current.mutateAsync().catch(() => undefined) })
    expect(toast.error).toHaveBeenCalledWith('クレジットが不足しています')
  })

  it('ログインが切れた・ワークスペースを使えないときは、生の 401 / 403 の文言を出さず訳した理由にする', async () => {
    const { Wrapper } = wrapper()
    mockFetchWithAuth.mockResolvedValue(json({ error: 'Unauthorized' }, 401))
    const unauthorized = renderHook(() => useAiConversations(), { wrapper: Wrapper })
    await waitFor(() => expect(unauthorized.result.current.isError).toBe(true))
    expect(unauthorized.result.current.error?.message).toBe('セッションが切れました。再度ログインしてください。')

    mockFetchWithAuth.mockResolvedValue(json({ error: 'No workspace found' }, 403))
    const forbidden = renderHook(() => useAiConversationMessages('c2'), { wrapper: Wrapper })
    await waitFor(() => expect(forbidden.result.current.isError).toBe(true))
    expect(forbidden.result.current.error?.message).toBe('このワークスペースを利用できません。メンバーのままか確認してください')
  })

  it('権限を説明する日本語の 403 は、そのまま出す', async () => {
    const { Wrapper } = wrapper()
    mockFetchWithAuth.mockResolvedValue(json({ error: 'AIへの依頼は、石を積んでいるメンバーのみ利用できます。' }, 403))
    const { result } = renderHook(() => useAiConversationMessages('c3'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('AIへの依頼は、石を積んでいるメンバーのみ利用できます。')
  })
})

