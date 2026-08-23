import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatQueryKeys, findProjectChannelById, mergeChannelMessages, reconcileCachedChannelMessage } from './client'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

const { mockFetchWithAuth } = vi.hoisted(() => ({ mockFetchWithAuth: vi.fn() }))

vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: mockFetchWithAuth }))

beforeEach(() => {
  mockFetchWithAuth.mockReset()
})

describe('findProjectChannelById', () => {
  it('マイルストーンチャンネルが先にあっても General を返す', () => {
    const channels: ProjectChannelDto[] = [
      {
        channelId: 'milestone-channel',
        channelName: '高所順応',
        projectId: 'project-1',
        projectTitle: '北アルプス',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        startTime: '09:30',
        endTime: '17:00',
        archived: false,
        unreadCount: 0,
        unreadMentionCount: 0,
        milestoneId: 'milestone-1',
        milestoneCompleted: false,
      },
      {
        channelId: 'general-channel',
        channelName: 'general',
        projectId: 'project-1',
        projectTitle: '北アルプス',
        startDate: null,
        endDate: null,
        startTime: null,
        endTime: null,
        archived: false,
        unreadCount: 0,
        unreadMentionCount: 0,
        milestoneId: null,
        milestoneCompleted: null,
      },
    ]

    expect(findProjectChannelById(channels, 'project-1')?.channelId).toBe('general-channel')
  })
})

describe('mergeChannelMessages', () => {
  it('再取得したページで未読起点の表示範囲を上書きしない', () => {
    const message = (id: string, createdAt: string) => ({ id, createdAt }) as MessageDto
    const current = [
      message('first-unread', '2026-01-01T00:00:00.000Z'),
      message('next-unread', '2026-01-01T00:01:00.000Z'),
    ]
    const refreshed = [
      message('next-unread', '2026-01-01T00:01:00.000Z'),
      message('new-message', '2026-01-01T00:02:00.000Z'),
    ]

    expect(mergeChannelMessages(current, refreshed).map(item => item.id))
      .toEqual(['first-unread', 'next-unread', 'new-message'])
  })
})

describe('reconcileCachedChannelMessage', () => {
  it('キャッシュ済みメッセージの更新と削除を対象IDだけに反映する', async () => {
    const queryClient = new QueryClient()
    const original = { id: 'message-1', content: 'before', createdAt: '2026-01-01T00:00:00.000Z' } as MessageDto
    const untouched = { id: 'message-2', content: 'keep', createdAt: '2026-01-01T00:01:00.000Z' } as MessageDto
    queryClient.setQueryData(chatQueryKeys.messages('channel-1'), [original, untouched])

    const updated = { ...original, content: 'after' }
    mockFetchWithAuth.mockResolvedValueOnce(new Response(JSON.stringify([updated]), { status: 200 }))
    await expect(reconcileCachedChannelMessage(queryClient, 'channel-1', original.id)).resolves.toBe(true)
    expect(queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages('channel-1')))
      .toEqual([updated, untouched])

    mockFetchWithAuth.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    await expect(reconcileCachedChannelMessage(queryClient, 'channel-1', original.id)).resolves.toBe(true)
    expect(queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages('channel-1')))
      .toEqual([untouched])
  })
})
