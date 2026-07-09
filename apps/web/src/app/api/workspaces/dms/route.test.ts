// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const TARGET_USER_ID = '00000000-0000-0000-0000-000000000002'

const { mockGetAuthContext, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDb: { select: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'cm.channelId', userId: 'cm.userId' },
  channelReadStates: { channelId: 'crs.channelId', userId: 'crs.userId', lastReadAt: 'crs.lastReadAt' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', membershipStatus: 'wm.membershipStatus' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

function selectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
    }),
  }
}

function postRequest() {
  return new Request('http://localhost/api/workspaces/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId: TARGET_USER_ID }),
  })
}

describe('POST /api/workspaces/dms', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('非活性メンバーへの新規 DM を 422 で拒否する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipStatus: 'inactive' }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'Inactive members cannot receive new DMs' })
  })
})
