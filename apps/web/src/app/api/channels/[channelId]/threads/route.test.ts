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
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockTxInsert: vi.fn(),
  mockTxSelect: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: mockRequireRole,
  requireChannelAccess: mockRequireChannelAccess,
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
  isNull: vi.fn(() => 'isNull'),
}))

const routeContext = { params: Promise.resolve({ channelId: 'channel-1' }) }

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
  mockTxSelect.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(memberRows),
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
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('通常チャンネルの直下に公開スレッドを作成する', async () => {
    selectResult([{ id: 'channel-1', workspaceId: 'workspace-1', isPrivate: false }])
    const { childInsert } = setupTransaction()
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'thread-1' })
    expect(childInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      parentChannelId: 'channel-1', name: 'リリース準備', isPrivate: false,
    }))
  })

  it('プライベートチャンネルでは親のメンバーをスレッドへ引き継ぐ', async () => {
    selectResult([{ id: 'channel-1', workspaceId: 'workspace-1', isPrivate: true }])
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
    selectResult([])
    const { POST } = await import('./route')

    const response = await POST(request(), routeContext)

    expect(response.status).toBe(404)
    expect(mockDbTransaction).not.toHaveBeenCalled()
  })
})
