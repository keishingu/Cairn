// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockDb,
} = vi.hoisted(() => ({
  SELF_USER_ID: '00000000-0000-0000-0000-000000000001',
  WORKSPACE_ID: '00000000-0000-0000-0000-000000000010',
  TARGET_USER_ID: '00000000-0000-0000-0000-000000000011',
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
    },
    error: null,
  }),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

const SELF_USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'
const TARGET_USER_ID = '00000000-0000-0000-0000-000000000011'

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  channelReadStates: { channelId: 'channelReadStates.channelId', userId: 'channelReadStates.userId', lastReadAt: 'channelReadStates.lastReadAt' },
  profiles: { id: 'profiles.id', kind: 'profiles.kind', displayName: 'profiles.displayName' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId', displayName: 'workspaceMembers.displayName', avatarUrl: 'workspaceMembers.avatarUrl' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  ne: vi.fn(() => 'ne'),
  sql: vi.fn(() => 'sql'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
  count: vi.fn(() => 'count'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'limit', 'orderBy']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('POST /api/workspaces/dms', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('bot profile を targetUserId に指定すると 422 を返す', async () => {
    mockDb.select.mockReturnValueOnce(chain([]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/dms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: TARGET_USER_ID }),
      }),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'targetUserId must be a human workspace member' })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
