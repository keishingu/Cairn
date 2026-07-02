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

function selectChain(result: unknown[]) {
  const offset = vi.fn().mockResolvedValue(result)
  const limit = vi.fn().mockReturnValue({ offset })
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  return {
    from,
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
    mockDb.select.mockReturnValueOnce(selectChain([
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

  it('アクセス不可の通知を除外した後に 50 件へ絞る', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    const rows = Array.from({ length: 52 }, (_, index) => ({
      id: `n-${index}`,
      type: 'dm' as const,
      title: `title-${index}`,
      body: `body-${index}`,
      data: { channelId: `channel-${index}` },
      readAt: null,
      createdAt: new Date(`2026-07-02T12:${String(index).padStart(2, '0')}:00Z`),
    }))
    mockDb.select.mockReturnValueOnce(selectChain(rows))
    mockRequireChannelAccess.mockImplementation(async (_workspaceId: string, _userId: string, channelId: string) => (
      ['channel-0', 'channel-1', 'channel-2'].includes(channelId)
        ? new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        : null
    ))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/notifications'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toHaveLength(49)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'n-3' }))
    expect(json.at(-1)).toEqual(expect.objectContaining({ id: 'n-51' }))
  })

  it('可視 50 件に届くまで 100 件単位で追加取得する', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `first-${index}`,
      type: 'dm' as const,
      title: `first-title-${index}`,
      body: `first-body-${index}`,
      data: { channelId: `hidden-${index}` },
      readAt: null,
      createdAt: new Date(`2026-07-02T10:${String(index % 60).padStart(2, '0')}:00Z`),
    }))
    const secondPage = Array.from({ length: 60 }, (_, index) => ({
      id: `second-${index}`,
      type: 'dm' as const,
      title: `second-title-${index}`,
      body: `second-body-${index}`,
      data: { channelId: `visible-${index}` },
      readAt: null,
      createdAt: new Date(`2026-07-02T11:${String(index % 60).padStart(2, '0')}:00Z`),
    }))
    mockDb.select
      .mockReturnValueOnce(selectChain(firstPage))
      .mockReturnValueOnce(selectChain(secondPage))
    mockRequireChannelAccess.mockImplementation(async (_workspaceId: string, _userId: string, channelId: string) => (
      channelId.startsWith('hidden-')
        ? new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
        : null
    ))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/notifications'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockDb.select).toHaveBeenCalledTimes(2)
    expect(mockRequireChannelAccess).toHaveBeenCalledTimes(160)
    expect(json).toHaveLength(50)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'second-0' }))
    expect(json.at(-1)).toEqual(expect.objectContaining({ id: 'second-49' }))
  })
})
