// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockGt,
  mockNe,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGt: vi.fn(() => Symbol('gt')),
  mockNe: vi.fn(() => Symbol('ne')),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  channelReadStates: {
    userId: 'channelReadStates.userId',
    channelId: 'channelReadStates.channelId',
    lastReadAt: 'channelReadStates.lastReadAt',
    lastReadMessageId: 'channelReadStates.lastReadMessageId',
  },
  channels: { id: 'channels.id' },
  messages: {
    id: 'messages.id',
    channelId: 'messages.channelId',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
    deletedAt: 'messages.deletedAt',
  },
  notifications: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq')),
  and: vi.fn(() => Symbol('and')),
  isNull: vi.fn(() => Symbol('isNull')),
  gt: mockGt,
  ne: mockNe,
  asc: vi.fn(() => Symbol('asc')),
  desc: vi.fn(() => Symbol('desc')),
  inArray: vi.fn(() => Symbol('inArray')),
  sql: vi.fn(() => 'sql'),
}))

function routeParams() {
  return { params: Promise.resolve({ channelId: CHANNEL_ID }) }
}

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

describe('GET /api/channels/[channelId]/read', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('最後の既読位置と、その次の最初の未読メッセージを返す', async () => {
    const lastReadAt = new Date('2026-08-23T01:00:00.000Z')
    mockSelectResults(
      [{ lastReadAt, lastReadMessageId: 'message-read' }],
      [{ id: 'message-unread' }],
    )

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), routeParams())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      lastReadMessageId: 'message-read',
      firstUnreadMessageId: 'message-unread',
    })
    expect(mockGt).toHaveBeenCalledWith('messages.createdAt', lastReadAt)
    expect(mockNe).toHaveBeenCalledWith('messages.senderId', USER_ID)
  })

  it('未読がなければ firstUnreadMessageId を null で返す', async () => {
    mockSelectResults(
      [{ lastReadAt: new Date('2026-08-23T01:00:00.000Z'), lastReadMessageId: 'latest' }],
      [],
    )

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), routeParams())

    await expect(response.json()).resolves.toEqual({
      lastReadMessageId: 'latest',
      firstUnreadMessageId: null,
    })
  })

  it('アクセス権がなければ既読位置を返さない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/'), routeParams())

    expect(response.status).toBe(403)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })
})
