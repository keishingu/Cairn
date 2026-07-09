import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useChannelMessageSearch,
  useGlobalMessageSearch,
  useChatProjects,
} from './use-chat-page'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import type { MessageSearchResultDto } from '@/app/api/search/messages/route'
import type { ProjectDto } from '@/app/api/projects/route'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper }
}

const STUB_MESSAGES: MessageDto[] = [{
  id: 'm1',
  senderId: 'u1',
  senderName: 'Alice',
  senderAvatarUrl: null,
  content: 'hello',
  messageType: 'text',
  createdAt: '2026-01-01T00:00:00.000Z',
  isEdited: false,
  reactions: [],
  attachments: [],
  parentMessageId: null,
  replyTo: null,
  bookmarked: false,
}]

const STUB_SEARCH_RESULTS: MessageSearchResultDto[] = [{
  id: 'm2',
  content: 'hello world',
  messageType: 'text',
  senderId: 'u2',
  senderAvatarUrl: null,
  reactions: [],
  attachments: [],
  parentMessageId: null,
  replyTo: null,
  bookmarked: false,
  isEdited: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  channelId: 'c2',
  channelName: 'general',
  senderName: 'Bob',
}]

const STUB_PROJECTS: ProjectDto[] = [{
  id: 'p1',
  title: 'Project A',
  description: 'desc',
  statusName: '進行中',
  statusColor: '#000000',
  startDate: null,
  endDate: null,
  coverPhotoUrl: null,
  taskCount: 2,
  completedTaskCount: 1,
  memberCount: 3,
  memberNames: ['Alice', 'Bob', 'Carol'],
  memberAvatarUrls: [null, null, null],
  isOwner: true,
  isMember: true,
  archived: false,
  coverPhotoIdx: 1,
  location: null,
  placeId: null,
}]

describe('useChannelMessageSearch', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('検索語があるときだけチャンネル内検索を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_MESSAGES), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useChannelMessageSearch('c1', 'hello'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_MESSAGES)
    expect(mockFetch).toHaveBeenCalledWith('/api/channels/c1/messages/search?q=hello')
  })

  it('検索語が空のときは取得しない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useChannelMessageSearch('c1', ''), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useGlobalMessageSearch', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('横断検索結果を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_SEARCH_RESULTS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useGlobalMessageSearch('hello'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_SEARCH_RESULTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/search/messages?q=hello')
  })
})

describe('useChatProjects', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('チャット詳細用のプロジェクト一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_PROJECTS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatProjects(true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_PROJECTS)
    expect(mockFetch).toHaveBeenCalledWith('/api/projects')
  })

  it('disabled のときは取得しない', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useChatProjects(false), { wrapper })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
