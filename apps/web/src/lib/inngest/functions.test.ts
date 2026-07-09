// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateFunction,
  mockSendPushToUser,
  mockDb,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn((_: unknown, __: unknown, handler: unknown) => handler),
  mockSendPushToUser: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

vi.mock('./client', () => ({
  inngest: {
    createFunction: mockCreateFunction,
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/ai/extract-text', () => ({
  isIndexable: vi.fn(() => true),
}))

vi.mock('@/lib/push/send', () => ({
  sendPushToUser: mockSendPushToUser,
}))

vi.mock('@/lib/push/suppress', () => ({
  hasReadMessage: vi.fn(() => false),
}))

vi.mock('@/lib/chat/mentions', () => ({
  extractMentionIds: vi.fn(() => []),
  stripMentionsToText: vi.fn((value: string) => value),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    membershipStatus: 'wm.membershipStatus',
  },
  channelMembers: {
    userId: 'cm.userId',
    channelId: 'cm.channelId',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  channels: {
    id: 'channels.id',
    type: 'channels.type',
  },
  messages: {
    id: 'messages.id',
    createdAt: 'messages.createdAt',
    deletedAt: 'messages.deletedAt',
  },
  channelReadStates: {
    userId: 'crs.userId',
    channelId: 'crs.channelId',
    lastReadAt: 'crs.lastReadAt',
    lastReadMessageId: 'crs.lastReadMessageId',
  },
  notifications: 'notifications',
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  inArray: vi.fn(() => 'inArray'),
}))

function whereChain(result: unknown[]) {
  const whereResult = {
    limit: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  const base = {
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
  }
  base.innerJoin.mockReturnValue(base)
  base.leftJoin.mockReturnValue(base)
  base.where.mockReturnValue(whereResult)

  return {
    from: vi.fn().mockReturnValue(base),
  }
}

describe('onTaskAssigned', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('inactive な assignee には通知を作らず push もしない', async () => {
    mockDb.select.mockReturnValueOnce(whereChain([]))

    const { onTaskAssigned } = await import('./functions')
    const handler = onTaskAssigned as unknown as (input: {
      event: { data: Record<string, string> }
      step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> }
    }) => Promise<unknown>
    const step = {
      run: <T,>(_name: string, fn: () => Promise<T>) => fn(),
    }

    const result = await handler({
      event: {
        data: {
          taskId: 'task-1',
          taskTitle: 'task',
          assigneeId: 'user-2',
          projectId: 'project-1',
          projectTitle: 'project',
          workspaceId: 'ws-1',
          assignerName: 'assigner',
        },
      },
      step,
    })

    expect(result).toEqual({ notified: null, skippedInactive: true })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })

  it('push 猶予中に inactive 化された DM 受信者には push しない', async () => {
    mockDb.select
      .mockReturnValueOnce(whereChain([{ userId: 'user-2', displayName: '受信者' }]))
      .mockReturnValueOnce(whereChain([{ type: 'dm' }]))
      .mockReturnValueOnce(whereChain([{ createdAt: new Date('2026-07-06T12:00:00.000Z'), deletedAt: null }]))
      .mockReturnValueOnce(whereChain([]))
      .mockReturnValueOnce(whereChain([]))
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue([]),
    })

    const { onMessageCreated } = await import('./functions')
    const handler = onMessageCreated as unknown as (input: {
      event: { data: Record<string, unknown> }
      step: {
        run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
        sleep: (name: string, duration: string) => Promise<void>
      }
    }) => Promise<unknown>

    const step = {
      run: <T,>(_name: string, fn: () => Promise<T>) => fn(),
      sleep: async (_name: string, _duration: string) => {},
    }

    const result = await handler({
      event: {
        data: {
          messageId: 'message-1',
          channelId: 'channel-1',
          workspaceId: 'ws-1',
          senderId: 'user-1',
          senderName: '送信者',
          content: 'hello',
          attachmentFileIds: [],
        },
      },
      step,
    })

    expect(result).toEqual({ mentionNotifications: 0, fileNotifications: 0, dm: true })
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })
})
