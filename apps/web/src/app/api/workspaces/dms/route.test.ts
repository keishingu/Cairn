// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDb: { select: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  channelReadStates: {
    channelId: 'channelReadStates.channelId',
    userId: 'channelReadStates.userId',
    lastReadAt: 'channelReadStates.lastReadAt',
    unreadMentionCount: 'channelReadStates.unreadMentionCount',
  },
  messages: {
    channelId: 'messages.channelId',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
    deletedAt: 'messages.deletedAt',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    avatarUrl: 'workspaceMembers.avatarUrl',
    membershipStatus: 'workspaceMembers.membershipStatus',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  gt: vi.fn(() => 'gt'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
  ne: vi.fn(() => 'ne'),
  count: vi.fn(() => 'count'),
  sql: vi.fn(() => 'sql'),
}))

function selectChain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy']) {
    c[method] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('GET /api/workspaces/dms', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('inactive な相手との既存 DM も一覧に残す', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([
        {
          id: 'dm-1',
          participantId: '00000000-0000-0000-0000-000000000002',
          participantName: '退会済みメンバー',
          participantAvatarUrl: null,
        },
      ]))
      .mockReturnValueOnce(selectChain([{ channelId: 'dm-1', cnt: 2 }]))
      .mockReturnValueOnce(selectChain([{ channelId: 'dm-1', cnt: 1 }]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      {
        id: 'dm-1',
        participantId: '00000000-0000-0000-0000-000000000002',
        participantName: '退会済みメンバー',
        participantAvatarUrl: null,
        unreadCount: 2,
        unreadMentionCount: 1,
      },
    ])
  })
})
