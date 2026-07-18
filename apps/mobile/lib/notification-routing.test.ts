import { describe, expect, it } from 'vitest'
import { routeFromNotification } from './notification-routing'

function notification(overrides: Partial<{
  type: 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
  data: Record<string, string> | null
}> = {}) {
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

describe('routeFromNotification', () => {
  it('channelId 付きのチャネル系通知は chats へ送る', () => {
    expect(routeFromNotification(notification({
      type: 'mention',
      data: { channelId: 'ch-1' },
    }))).toBe('/(app)/chats')
  })

  it('task 通知は url がなくても tasks へ送る', () => {
    expect(routeFromNotification(notification({ type: 'task' }))).toBe('/(app)/tasks')
  })

  it('taskId 付きの AI 通知はネイティブにカードがないため tasks へ送る', () => {
    expect(routeFromNotification(notification({
      type: 'ai',
      data: { channelId: 'ch-1', taskId: 'task-1' },
    }))).toBe('/(app)/tasks')
  })

  it('taskId のない AI 通知は channelId があれば chats へ送る', () => {
    expect(routeFromNotification(notification({
      type: 'ai',
      data: { channelId: 'ch-1' },
    }))).toBe('/(app)/chats')
  })

  it('url があれば対応するトップレベル画面を優先する', () => {
    expect(routeFromNotification(notification({
      type: 'status',
      data: { url: '/settings/account' },
    }))).toBe('/(app)/settings')
  })
})
