import { describe, expect, it } from 'vitest'
import {
  readPushNotificationData,
  routeFromNotification,
  routeFromPushUrl,
} from './notification-routing'

function notification(
  overrides: Partial<{
    type: 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
    data: Record<string, string> | null
  }> = {},
) {
  return {
    id: 'n1',
    type: 'status' as const,
    title: 'title',
    body: 'body',
    data: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('通知からの画面遷移', () => {
  it('channelId 付きのチャネル系通知はそのチャットへ送る', () => {
    expect(
      routeFromNotification(
        notification({
          type: 'mention',
          data: { channelId: 'ch-1' },
        }),
      ),
    ).toEqual({ kind: 'channel', channelId: 'ch-1' })
    expect(
      routeFromNotification(
        notification({
          type: 'dm',
          data: { channelId: 'dm-1' },
        }),
      ),
    ).toEqual({ kind: 'channel', channelId: 'dm-1' })
    expect(
      routeFromNotification(
        notification({
          type: 'reaction',
          data: { channelId: 'ch-2' },
        }),
      ),
    ).toEqual({ kind: 'channel', channelId: 'ch-2' })
  })

  it('task 通知は url がなくても tasks へ送る', () => {
    expect(routeFromNotification(notification({ type: 'task' }))).toEqual({
      kind: 'screen',
      path: '/(app)/tasks',
    })
  })

  it('taskId 付きの AI 通知はネイティブにカードがないため tasks へ送る', () => {
    expect(
      routeFromNotification(
        notification({
          type: 'ai',
          data: { channelId: 'ch-1', taskId: 'task-1' },
        }),
      ),
    ).toEqual({ kind: 'screen', path: '/(app)/tasks' })
  })

  it('taskId のない AI 通知は channelId があればそのチャットへ送る', () => {
    expect(
      routeFromNotification(
        notification({
          type: 'ai',
          data: { channelId: 'ch-1' },
        }),
      ),
    ).toEqual({ kind: 'channel', channelId: 'ch-1' })
  })

  it('url があれば対応するトップレベル画面を優先する', () => {
    expect(
      routeFromNotification(
        notification({
          type: 'status',
          data: { url: '/settings/account' },
        }),
      ),
    ).toEqual({ kind: 'screen', path: '/(app)/settings' })
  })

  it('Push の data から url と workspaceId だけを読む', () => {
    expect(readPushNotificationData({ url: '/chats/ch-1', workspaceId: 'ws-1', extra: 1 })).toEqual(
      {
        url: '/chats/ch-1',
        workspaceId: 'ws-1',
      },
    )
    expect(readPushNotificationData({ url: '/tasks' })).toEqual({ url: '/tasks' })
    expect(readPushNotificationData(null)).toEqual({})
    expect(readPushNotificationData({ workspaceId: '' })).toEqual({})
  })

  it('チャット URL は個別チャンネルを優先する', () => {
    expect(routeFromPushUrl('/chats/ch-1')).toEqual({ kind: 'channel', channelId: 'ch-1' })
    expect(routeFromPushUrl('/tasks')).toEqual({ kind: 'screen', path: '/(app)/tasks' })
    expect(routeFromPushUrl(undefined)).toBeNull()
  })
})
