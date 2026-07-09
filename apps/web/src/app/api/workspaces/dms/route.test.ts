// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const TARGET_USER_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDbSelect, mockDbInsert, mockEq, mockAnd, mockInArray } = vi.hoisted(
  () => ({
    mockGetAuthContext: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockEq: vi.fn(() => Symbol('eq')),
    mockAnd: vi.fn(() => Symbol('and')),
    mockInArray: vi.fn(() => Symbol('inArray')),
  }),
)

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { userId: 'channelMembers.userId', channelId: 'channelMembers.channelId' },
  channelReadStates: {
    userId: 'channelReadStates.userId',
    channelId: 'channelReadStates.channelId',
    lastReadAt: 'channelReadStates.lastReadAt',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    membershipStatus: 'workspaceMembers.membershipStatus',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
  sql: vi.fn(() => 'sql'),
}))

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/workspaces/dms', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('inactive なワークスペースメンバーとの DM 作成を拒否する', async () => {
    mockSelectResults([{ userId: TARGET_USER_ID, membershipStatus: 'inactive' }])
    const { POST } = await import('./route')
    const res = await POST(postRequest({ targetUserId: TARGET_USER_ID }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: '指定されたユーザーはアクティブなワークスペースメンバーではありません',
    })
    expect(mockDbInsert).not.toHaveBeenCalled()
  })
})
