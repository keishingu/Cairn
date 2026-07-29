import { describe, expect, test } from 'vitest'
import type { NotificationDto } from '@/lib/notifications/client'
import { notificationHref } from './notifications'

function notification(data: NotificationDto['data']): NotificationDto {
  return {
    id: 'notification-1',
    type: 'ai',
    title: 'AI PMO',
    body: '期限が近づいています',
    data,
    readAt: null,
    createdAt: '2026-07-18T03:00:00.000Z',
  }
}

describe('AI通知の遷移先', () => {
  test('チャンネルに紐づく場合は本人限定カードがあるチャットへ遷移する', () => {
    expect(notificationHref(notification({ channelId: 'channel-1', taskId: 'task-1' })))
      .toBe('/chats/channel-1')
  })

  test('チャンネルがないタスクナッジは対象タスクへ遷移する', () => {
    expect(notificationHref(notification({ taskId: 'task/1' })))
      .toBe('/tasks?taskId=task%2F1')
  })

  test('対象情報がない場合は遷移しない', () => {
    expect(notificationHref(notification({ nudgeId: 'nudge-1' }))).toBeNull()
  })
})
