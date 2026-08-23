import { describe, expect, it } from 'vitest'
import { chatQueryKeys, findProjectChannelById } from './client'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'

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

describe('chatQueryKeys', () => {
  it('最新100件と履歴を別のキャッシュに分ける', () => {
    expect(chatQueryKeys.messages('channel-1')).toEqual(['messages', 'channel-1'])
    expect(chatQueryKeys.messageHistory('channel-1', 'message-1')).toEqual([
      'message-history',
      'channel-1',
      'message-1',
    ])
  })
})
