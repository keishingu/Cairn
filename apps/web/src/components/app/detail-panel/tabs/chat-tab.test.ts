// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import { filterProjectChatTabChannels } from './chat-tab'

function makeChannel(overrides: Partial<ProjectChannelDto>): ProjectChannelDto {
  return {
    channelId: 'general-1',
    channelName: 'general',
    projectId: 'project-1',
    projectTitle: 'プロジェクト1',
    startDate: null,
    endDate: null,
    startTime: null,
    endTime: null,
    archived: false,
    unreadCount: 0,
    unreadMentionCount: 0,
    milestoneId: null,
    milestoneCompleted: null,
    ...overrides,
  }
}

describe('filterProjectChatTabChannels', () => {
  it('対象プロジェクトのGeneralと未完了マイルストーンだけを返す', () => {
    const general = makeChannel({})
    const activeMilestone = makeChannel({
      channelId: 'milestone-active',
      channelName: '進行中マイルストーン',
      milestoneId: 'milestone-1',
      milestoneCompleted: false,
    })
    const completedMilestone = makeChannel({
      channelId: 'milestone-completed',
      channelName: '完了済みマイルストーン',
      milestoneId: 'milestone-2',
      milestoneCompleted: true,
    })
    const otherProject = makeChannel({
      channelId: 'other-project',
      projectId: 'project-2',
    })

    expect(filterProjectChatTabChannels(
      [general, activeMilestone, completedMilestone, otherProject],
      'project-1',
    )).toEqual([general, activeMilestone])
  })
})
