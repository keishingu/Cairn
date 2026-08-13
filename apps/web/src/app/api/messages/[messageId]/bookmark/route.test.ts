// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockRunForActiveMembership,
  mockDbSelect,
  mockTxSelect,
  mockTxInsert,
  mockTxDelete,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockRunForActiveMembership: vi.fn(),
  mockDbSelect: vi.fn(),
  mockTxSelect: vi.fn(),
  mockTxInsert: vi.fn(),
  mockTxDelete: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMembership: mockRunForActiveMembership,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  messages: { id: 'messages.id', channelId: 'messages.channelId' },
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId' },
  messageBookmarks: {
    id: 'messageBookmarks.id',
    messageId: 'messageBookmarks.messageId',
    userId: 'messageBookmarks.userId',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq')),
  and: vi.fn(() => Symbol('and')),
}))

function selectChain(result: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

describe('POST /api/messages/[messageId]/bookmark', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDbSelect.mockReturnValue(selectChain([{ channelId: CHANNEL_ID, workspaceId: WORKSPACE_ID }]))
    mockTxSelect.mockReturnValue(selectChain([]))
    mockTxInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
    mockRunForActiveMembership.mockImplementation(
      async (_db: unknown, _workspaceId: string, _userId: string, action: (tx: unknown) => unknown) =>
        action({ select: mockTxSelect, insert: mockTxInsert, delete: mockTxDelete }),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('active membershipのロック下でブックマークを追加する', async () => {
    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/', { method: 'POST' }), {
      params: Promise.resolve({ messageId: MESSAGE_ID }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ bookmarked: true })
    expect(mockRunForActiveMembership).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      USER_ID,
      expect.any(Function),
    )
    expect(mockTxInsert).toHaveBeenCalledOnce()
  })

  it('退会済みならブックマークを追加できない', async () => {
    mockRunForActiveMembership.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/', { method: 'POST' }), {
      params: Promise.resolve({ messageId: MESSAGE_ID }),
    })

    expect(res.status).toBe(403)
    expect(mockTxInsert).not.toHaveBeenCalled()
  })
})
