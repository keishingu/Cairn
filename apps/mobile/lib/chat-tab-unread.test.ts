import { describe, expect, test } from 'vitest'
import { chatTabUnreadCount } from './chat-tab-unread'

const project = (overrides: {
  archived?: boolean
  milestoneId?: string | null
  milestoneCompleted?: boolean | null
  unreadCount: number
}) => ({ archived: false, milestoneId: null, milestoneCompleted: null, ...overrides })

describe('chatTabUnreadCount', () => {
  test('プロジェクト・ワークスペースチャンネル・DMの未読を合算する', () => {
    expect(
      chatTabUnreadCount({
        projectChannels: [project({ unreadCount: 2 }), project({ milestoneId: 'm1', milestoneCompleted: false, unreadCount: 1 })],
        workspaceChannels: [{ id: 'w1', archived: false, parentChannelId: null, unreadCount: 3 }],
        dms: [{ unreadCount: 4 }],
      }),
    ).toBe(10)
  })

  test('アーカイブ済みプロジェクトのチャンネルは一覧で折りたたまれているため数えない', () => {
    expect(
      chatTabUnreadCount({
        projectChannels: [
          project({ archived: true, unreadCount: 1 }),
          project({ archived: true, milestoneId: 'm1', milestoneCompleted: false, unreadCount: 2 }),
        ],
        workspaceChannels: [],
        dms: [],
      }),
    ).toBe(0)
  })

  test('完了済みマイルストーンのチャンネルは一覧で折りたたまれているため数えない', () => {
    expect(
      chatTabUnreadCount({
        projectChannels: [project({ milestoneId: 'm1', milestoneCompleted: true, unreadCount: 5 })],
        workspaceChannels: [],
        dms: [],
      }),
    ).toBe(0)
  })

  test('アーカイブ済みチャンネルと、親がアーカイブ済みのスレッドは数えない', () => {
    expect(
      chatTabUnreadCount({
        projectChannels: [],
        workspaceChannels: [
          { id: 'parent', archived: true, parentChannelId: null, unreadCount: 1 },
          { id: 'child', archived: false, parentChannelId: 'parent', unreadCount: 2 },
          { id: 'thread', archived: true, parentChannelId: 'w1', unreadCount: 3 },
          { id: 'w1', parentChannelId: null, unreadCount: 4 },
        ],
        dms: [],
      }),
    ).toBe(4)
  })
})
