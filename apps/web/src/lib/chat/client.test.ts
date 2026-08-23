import { describe, expect, it } from 'vitest'
import { findProjectChannelById, mergeChannelMessages } from './client'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

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
