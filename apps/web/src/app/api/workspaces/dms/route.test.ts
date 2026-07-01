// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = 'ws-00000001'

const { mockGetAuthContext, mockDb } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: 'ws-00000001',
    },
    error: null,
  })
  const mockDb = { select: vi.fn() }
  return { mockGetAuthContext, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'cm.channelId', userId: 'cm.userId' },
  channelReadStates: { channelId: 'crs.channelId', userId: 'crs.userId', lastReadAt: 'crs.lastReadAt', unreadMentionCount: 'crs.unreadMentionCount' },
  messages: { channelId: 'messages.channelId', deletedAt: 'messages.deletedAt', senderId: 'messages.senderId', createdAt: 'messages.createdAt' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: { avatarUrl: 'wm.avatarUrl', status: 'wm.status', statusMessage: 'wm.statusMessage', userId: 'wm.userId', workspaceId: 'wm.workspaceId' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
  eq: vi.fn(() => 'eq'),
  gt: vi.fn(() => 'gt'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
  ne: vi.fn(() => 'ne'),
  sql: vi.fn(() => 'sql'),
}))

function chain(result: unknown[]) {
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

describe('GET /api/workspaces/dms の応答', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
  })

  it('DM 相手の status と statusMessage を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ channelId: 'dm-1' }]))
      .mockReturnValueOnce(chain([
        {
          id: 'dm-1',
          participantId: 'user-2',
          participantName: 'Alice',
          participantAvatarUrl: 'https://example.com/alice.png',
          participantStatus: 'away',
          participantStatusMessage: '離席中',
        },
      ]))
      .mockReturnValueOnce(chain([{ channelId: 'dm-1', cnt: 2 }]))
      .mockReturnValueOnce(chain([{ channelId: 'dm-1', cnt: 1 }]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      {
        id: 'dm-1',
        participantId: 'user-2',
        participantName: 'Alice',
        participantAvatarUrl: 'https://example.com/alice.png',
        participantStatus: 'away',
        participantStatusMessage: '離席中',
        unreadCount: 2,
        unreadMentionCount: 1,
      },
    ])
  })

  it('status が null のとき offline に寄せる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ channelId: 'dm-2' }]))
      .mockReturnValueOnce(chain([
        {
          id: 'dm-2',
          participantId: 'user-3',
          participantName: 'Bob',
          participantAvatarUrl: null,
          participantStatus: null,
          participantStatusMessage: null,
        },
      ]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      {
        id: 'dm-2',
        participantId: 'user-3',
        participantName: 'Bob',
        participantAvatarUrl: null,
        participantStatus: 'offline',
        participantStatusMessage: null,
        unreadCount: 0,
        unreadMentionCount: 0,
      },
    ])
  })
})
