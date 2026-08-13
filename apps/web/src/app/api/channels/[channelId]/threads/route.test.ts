// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockRequireRole,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbTransaction,
  mockTxInsert,
  mockTxSelect,
  mockLockActiveMemberships,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockTxInsert: vi.fn(),
  mockTxSelect: vi.fn(),
  mockLockActiveMemberships: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: mockRequireRole,
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@/lib/access/active-membership-lock', () => ({
  lockActiveMemberships: mockLockActiveMemberships,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, transaction: mockDbTransaction },
  channels: {
    id: 'channels.id', workspaceId: 'channels.workspaceId', isPrivate: 'channels.isPrivate',
    type: 'channels.type', parentChannelId: 'channels.parentChannelId',
  },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))

const routeContext = { params: Promise.resolve({ channelId: 'channel-1' }) }

const parentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'channel-1',
  workspaceId: 'workspace-1',
  isPrivate: false,
  parentChannelId: null,
  parentColumnReady: true,
  ...overrides,
})

function request(name = 'リリース準備') {
  return new Request('http://localhost/api/channels/channel-1/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

function selectResult(result: unknown[]) {
  const builder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
  mockDbSelect.mockReturnValue(builder)
}

function setupTransaction(memberRows: { userId: string }[] = []) {
  mockTxInsert.mockReset()
  const childInsert = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'thread-1' }]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }
  const memberInsert = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }
  mockTxInsert.mockReturnValueOnce(childInsert).mockReturnValueOnce(memberInsert)
  const selectResults = [[{ id: 'channel-1' }], memberRows]
  mockTxSelect.mockImplementation(() => {
    const result = selectResults.shift() ?? []
    const builder = {
      from: vi.fn(() => builder),
      where: vi.fn(() => builder),
      for: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
  mockDbTransaction.mockImplementation(async callback => callback({ insert: mockTxInsert, select: mockTxSelect }))
  return { childInsert, memberInsert }
}

describe('POST /api/channels/[channelId]/threads', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockLockActiveMemberships.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('通常チャンネルの直下に公開スレッドを作成する', async () => {
    selectResult([parentRow()])
    const { childInsert } = setupTransaction()
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'thread-1' })
    expect(childInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      parentChannelId: 'channel-1', name: 'リリース準備', isPrivate: false,
    }))
  })

  it('公開チャンネルでも親の参加メンバーをスレッドへ引き継ぐ', async () => {
    selectResult([parentRow()])
    const { memberInsert } = setupTransaction([{ userId: 'guest-1' }])
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(201)
    expect(memberInsert.values).toHaveBeenCalledWith([
      { channelId: 'thread-1', userId: 'guest-1' },
    ])
    expect(mockLockActiveMemberships).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mockTxInsert, select: mockTxSelect }),
      'workspace-1',
      ['user-1', 'guest-1'],
    )
  })

  it('退会済みの親チャンネル参加者がいればスレッドを作成しない', async () => {
    selectResult([parentRow()])
    const { childInsert } = setupTransaction([{ userId: 'user-2' }])
    mockLockActiveMemberships.mockResolvedValue(false)
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(422)
    expect(childInsert.values).not.toHaveBeenCalled()
  })

  it('プライベートチャンネルでは親のメンバーをスレッドへ引き継ぐ', async () => {
    selectResult([parentRow({ isPrivate: true })])
    const { memberInsert } = setupTransaction([{ userId: 'user-1' }, { userId: 'user-2' }])
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(201)
    expect(memberInsert.values).toHaveBeenCalledWith([
      { channelId: 'thread-1', userId: 'user-1' },
      { channelId: 'thread-1', userId: 'user-2' },
    ])
  })

  it('ゲストはスレッドを作成できない', async () => {
    mockRequireRole.mockReturnValue(new Response(null, { status: 403 }))
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(403)
    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  it('スレッドの下にさらにスレッドを作成できない', async () => {
    selectResult([parentRow({ parentChannelId: 'parent-channel' })])
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(404)
    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  it('migration適用前は既存チャンネルを壊さず503を返す', async () => {
    selectResult([parentRow({ parentColumnReady: false })])
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(503)
    expect(mockDbTransaction).not.toHaveBeenCalled()
  })
})
