// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbInsert,
  mockDbDelete,
  mockEq,
  mockAnd,
  mockIsNull,
  mockCount,
  mockRunForActiveMembership,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
  mockCount: vi.fn(() => Symbol('count')),
  mockRunForActiveMembership: vi.fn(),
}))

vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMembership: mockRunForActiveMembership,
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, delete: mockDbDelete },
  messages: { id: 'messages.id', channelId: 'messages.channelId', deletedAt: 'messages.deletedAt' },
  messageReactions: {
    id: 'messageReactions.id',
    messageId: 'messageReactions.messageId',
    userId: 'messageReactions.userId',
    emoji: 'messageReactions.emoji',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  count: mockCount,
  isNull: mockIsNull,
}))

function ctxRouteParams() {
  return { params: Promise.resolve({ messageId: MESSAGE_ID }) }
}

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

describe('/api/messages/[messageId]/reactions のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRunForActiveMembership.mockImplementation(
      async (_db: unknown, _workspaceId: string, _userId: string, action: (tx: unknown) => unknown) =>
        action({ select: mockDbSelect, insert: mockDbInsert, delete: mockDbDelete }),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('存在しないメッセージには 404 を返す', async () => {
    mockSelectResults([])
    const { POST } = await import('./route')
    const res = await POST(postRequest({ emoji: '👍' }), ctxRouteParams())
    expect(res.status).toBe(404)
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
  })

  it('アクセス権の無いチャンネルのメッセージには 403 を返し、リアクションを追加できない（越境リアクションIDOR防止）', async () => {
    mockSelectResults([{ channelId: CHANNEL_ID }])
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(postRequest({ emoji: '👍' }), ctxRouteParams())
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID, 'member')
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('アクセス権のあるチャンネルのメッセージにはリアクションを追加できる', async () => {
    mockSelectResults(
      [{ channelId: CHANNEL_ID }],
      [], // 既存リアクションなし
      [{ n: 1 }],
    )
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDbInsert.mockReturnValue({ values: () => Promise.resolve(undefined) })
    const { POST } = await import('./route')
    const res = await POST(postRequest({ emoji: '👍' }), ctxRouteParams())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ added: true, emoji: '👍', count: 1 })
    expect(mockRunForActiveMembership).toHaveBeenCalledWith(
      expect.anything(),
      DEV_WORKSPACE_ID,
      DEV_USER_ID,
      expect.any(Function),
    )
  })

  it('退会済みならリアクションを追加できない', async () => {
    mockSelectResults([{ channelId: CHANNEL_ID }])
    mockRequireChannelAccess.mockResolvedValue(null)
    mockRunForActiveMembership.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(postRequest({ emoji: '👍' }), ctxRouteParams())

    expect(res.status).toBe(403)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })
})
