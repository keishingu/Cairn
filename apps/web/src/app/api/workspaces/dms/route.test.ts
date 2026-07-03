// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const TARGET_USER_ID = '30000000-0000-0000-0000-000000000001'
const DM_CHANNEL_ID = '40000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDbSelect,
  mockDbInsert,
  mockEq,
  mockAnd,
  mockInArray,
  mockNe,
  mockSql,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockInArray: vi.fn(() => Symbol('inArray')),
  mockNe: vi.fn(() => Symbol('ne')),
  mockSql: vi.fn(() => Symbol('sql')),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  channelReadStates: {
    channelId: 'channelReadStates.channelId',
    userId: 'channelReadStates.userId',
    lastReadAt: 'channelReadStates.lastReadAt',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    membershipStatus: 'workspaceMembers.membershipStatus',
    avatarUrl: 'workspaceMembers.avatarUrl',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
  ne: mockNe,
  sql: mockSql,
}))

function postRequest(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

function mockInsertChain() {
  const channelInsertBuilder = {
    values: () => channelInsertBuilder,
    returning: () => Promise.resolve([{ id: DM_CHANNEL_ID }]),
  }
  const noopInsertBuilder = {
    values: () => noopInsertBuilder,
    onConflictDoNothing: () => Promise.resolve(undefined),
  }

  mockDbInsert
    .mockReturnValueOnce(channelInsertBuilder)
    .mockReturnValueOnce(noopInsertBuilder)
    .mockReturnValueOnce(noopInsertBuilder)
}

describe('/api/workspaces/dms POST のアクセス制御', () => {
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
    mockSelectResults([])
    const { POST } = await import('./route')
    const res = await POST(postRequest({ targetUserId: TARGET_USER_ID }))
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: '指定されたユーザーはアクティブなワークスペースメンバーではありません',
    })
    expect(mockEq).toHaveBeenCalledWith('workspaceMembers.membershipStatus', 'active')
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('active なワークスペースメンバーとは新規 DM を作成できる', async () => {
    mockSelectResults([{ userId: TARGET_USER_ID }], [])
    mockInsertChain()
    const { POST } = await import('./route')
    const res = await POST(postRequest({ targetUserId: TARGET_USER_ID }))
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ id: DM_CHANNEL_ID })
  })

  it('GET は inactive な参加者の DM を一覧から除外する', async () => {
    mockSelectResults([])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([])
    expect(mockEq).toHaveBeenCalledWith('workspaceMembers.membershipStatus', 'active')
  })
})
