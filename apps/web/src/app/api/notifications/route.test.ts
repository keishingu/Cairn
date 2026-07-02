// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockRequireChannelAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockRequireChannelAccess: vi.fn(),
}))

const getAuthContext = vi.fn()

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  notifications: {
    id: 'notifications.id',
    userId: 'notifications.userId',
    workspaceId: 'notifications.workspaceId',
    readAt: 'notifications.readAt',
    type: 'notifications.type',
    createdAt: 'notifications.createdAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}))

function selectLimitChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  }
}

describe('GET /api/notifications', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('channelId 付き通知は現在アクセスできる channel だけ返す', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    mockDb.select.mockReturnValueOnce(selectLimitChain([
      {
        id: 'n-visible',
        type: 'dm',
        title: 'visible',
        body: 'ok',
        data: { channelId: 'channel-visible' },
        readAt: null,
        createdAt: new Date('2026-07-02T12:00:00Z'),
      },
      {
        id: 'n-hidden',
        type: 'mention',
        title: 'hidden',
        body: 'ng',
        data: { channelId: 'channel-hidden' },
        readAt: null,
        createdAt: new Date('2026-07-02T12:01:00Z'),
      },
      {
        id: 'n-task',
        type: 'task',
        title: 'task',
        body: 'keep',
        data: null,
        readAt: null,
        createdAt: new Date('2026-07-02T12:02:00Z'),
      },
    ]))
    mockRequireChannelAccess.mockImplementation(async (_workspaceId: string, _userId: string, channelId: string) => (
      channelId === 'channel-hidden'
        ? new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        : null
    ))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/notifications'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: 'n-visible' }),
      expect.objectContaining({ id: 'n-task' }),
    ])
    expect(mockRequireChannelAccess).toHaveBeenCalledTimes(2)
  })
})
