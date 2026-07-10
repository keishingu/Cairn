import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'
import {
  chatSearchQueryKeys,
  useChannelMessageSearch,
  useGlobalMessageSearch,
} from './use-chat-search'

vi.mock('@/lib/fetch-with-auth')

const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

const CHANNEL_RESULTS: MessageDto[] = [
  {
    id: 'm1',
    senderId: 'u1',
    senderName: 'Kei',
    senderAvatarUrl: null,
    content: '来週の山行どうする？',
    messageType: 'text',
    createdAt: '2026-07-11T08:00:00.000Z',
    isEdited: false,
    reactions: [],
    attachments: [],
    parentMessageId: null,
    replyTo: null,
    bookmarked: false,
  },
]

const GLOBAL_RESULTS: MessageSearchResultDto[] = [
  {
    id: 'm2',
    senderId: 'u2',
    senderName: 'Ebi',
    senderAvatarUrl: null,
    content: '集合時間を決めよう',
    messageType: 'text',
    createdAt: '2026-07-11T08:05:00.000Z',
    isEdited: false,
    reactions: [],
    attachments: [],
    parentMessageId: null,
    replyTo: null,
    bookmarked: false,
    channelId: 'c2',
    channelName: '登山本部',
  },
]

describe('useChannelMessageSearch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('チャンネル内検索結果を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(CHANNEL_RESULTS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useChannelMessageSearch('c1', '山行'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(CHANNEL_RESULTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/channels/c1/messages/search?q=%E5%B1%B1%E8%A1%8C')
  })

  it('クエリが空ならフェッチしない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useChannelMessageSearch('c1', ''), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fresh cache があれば再フェッチしない', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(chatSearchQueryKeys.channelMessages('c1', '山行'), CHANNEL_RESULTS)
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useChannelMessageSearch('c1', '山行'), { wrapper: Wrapper })

    expect(result.current.data).toEqual(CHANNEL_RESULTS)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useGlobalMessageSearch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('横断検索結果を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(GLOBAL_RESULTS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalMessageSearch('集合'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(GLOBAL_RESULTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/search/messages?q=%E9%9B%86%E5%90%88')
  })

  it('クエリが空ならフェッチしない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useGlobalMessageSearch(''), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
