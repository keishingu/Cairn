import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreatePoll, usePoll, useVotePoll } from './use-poll'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth')

const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

describe('usePoll', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('messageId を使って /api/polls/:id を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      id: 'poll-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      question: '来週どこ行く？',
      allowMultiple: false,
      anonymous: false,
      createdBy: 'user-1',
      createdAt: '2026-07-10T00:00:00.000Z',
      selectedOptionIds: [],
      options: [
        { id: 'option-1', text: 'A', displayOrder: 0, voteCount: 0, voters: [] },
        { id: 'option-2', text: 'B', displayOrder: 1, voteCount: 0, voters: [] },
      ],
    }), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => usePoll('message-1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith('/api/polls/message-1')
    expect(result.current.data?.question).toBe('来週どこ行く？')
  })
})

describe('useCreatePoll', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('投票作成後にメッセージ一覧を invalidate し、poll キャッシュを埋める', async () => {
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      id: 'poll-1',
      messageId: 'message-1',
      channelId: 'channel-1',
      question: '来週どこ行く？',
      allowMultiple: true,
      anonymous: true,
      options: [
        { id: 'option-1', text: 'A', displayOrder: 0 },
        { id: 'option-2', text: 'B', displayOrder: 1 },
      ],
      createdAt: '2026-07-10T00:00:00.000Z',
    }), { status: 201 }))

    const { result } = renderHook(() => useCreatePoll('channel-1'), { wrapper })

    act(() => {
      result.current.mutate({
        question: '来週どこ行く？',
        options: ['A', 'B'],
        allowMultiple: true,
        anonymous: true,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/polls',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'channel-1'] })
    expect(queryClient.getQueryData(['poll', 'message-1'])).toMatchObject({
      id: 'poll-1',
      messageId: 'message-1',
      selectedOptionIds: [],
      options: [
        expect.objectContaining({ voteCount: 0 }),
        expect.objectContaining({ voteCount: 0 }),
      ],
    })
  })
})

describe('useVotePoll', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('投票更新後に selectedOptionIds を反映し、詳細を再取得する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    queryClient.setQueryData(['poll', 'message-1'], {
      id: 'poll-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      question: '来週どこ行く？',
      allowMultiple: true,
      anonymous: false,
      createdBy: 'user-1',
      createdAt: '2026-07-10T00:00:00.000Z',
      selectedOptionIds: [],
      options: [],
    })
    queryClient.setQueryData(['poll', 'poll-1'], {
      id: 'poll-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      question: '来週どこ行く？',
      allowMultiple: true,
      anonymous: false,
      createdBy: 'user-1',
      createdAt: '2026-07-10T00:00:00.000Z',
      selectedOptionIds: [],
      options: [],
    })
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      id: 'poll-1',
      optionIds: ['option-1', 'option-2'],
    }), { status: 200 }))

    const { result } = renderHook(() => useVotePoll('message-1'), { wrapper })

    act(() => {
      result.current.mutate(['option-1', 'option-2'])
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/polls/message-1/vote',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ optionIds: ['option-1', 'option-2'] }) }),
    )
    expect(queryClient.getQueryData<{ selectedOptionIds: string[] }>(['poll', 'message-1'])?.selectedOptionIds).toEqual(['option-1', 'option-2'])
    expect(queryClient.getQueryData<{ selectedOptionIds: string[] }>(['poll', 'poll-1'])?.selectedOptionIds).toEqual(['option-1', 'option-2'])
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['poll', 'message-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['poll', 'poll-1'] })
  })
})
