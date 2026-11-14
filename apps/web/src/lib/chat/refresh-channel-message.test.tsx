// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithAuth = vi.fn()
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: (...args: unknown[]) => fetchWithAuth(...args) }))

const { chatQueryKeys, useRefreshChannelMessage } = await import('./client')

type Message = { id: string; blocksRevision: string | null; createdAt: string }
const message = (id: string, blocksRevision: string | null = 'r1'): Message => ({ id, blocksRevision, createdAt: `2026-11-07T00:00:0${id}Z` })

function setup() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useRefreshChannelMessage('c'), { wrapper })
  return { queryClient, refresh: result.current }
}

describe('カードのメッセージだけの取り直し', () => {
  beforeEach(() => fetchWithAuth.mockReset())

  it('読み込み済みの範囲（上へ足した古いページ）を残したまま、そのメッセージだけを差し替える', async () => {
    const { queryClient, refresh } = setup()
    queryClient.setQueryData(chatQueryKeys.messages('c'), [message('1'), message('2'), message('3')])
    queryClient.setQueryData(chatQueryKeys.messageHistory('c', 'h'), [message('2'), message('4')])
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify([message('1', 'r9'), message('2', 'r2'), message('5', 'r9')])))

    await act(() => refresh('2'))

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/channels/c/messages?around=2')
    expect(queryClient.getQueryData(chatQueryKeys.messages('c'))).toEqual([message('1'), message('2', 'r2'), message('3')])
    expect(queryClient.getQueryData(chatQueryKeys.messageHistory('c', 'h'))).toEqual([message('2', 'r2'), message('4')])
  })

  it('取得に失敗したらキャッシュを変えずにエラーを投げる', async () => {
    const { queryClient, refresh } = setup()
    const cached = [message('1'), message('2')]
    queryClient.setQueryData(chatQueryKeys.messages('c'), cached)
    fetchWithAuth.mockResolvedValue(new Response('{}', { status: 500 }))

    await expect(refresh('2')).rejects.toThrow()
    expect(queryClient.getQueryData(chatQueryKeys.messages('c'))).toBe(cached)
  })
})
