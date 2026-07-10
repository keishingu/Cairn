// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockToggleCheckboxAt,
  mockDb,
  mockEq,
  mockAnd,
  mockIsNull,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockToggleCheckboxAt: vi.fn((content: string) => content),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@/lib/chat/checkboxes', () => ({
  toggleCheckboxAt: mockToggleCheckboxAt,
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  messages: {
    id: 'messages.id',
    content: 'messages.content',
    channelId: 'messages.channelId',
    messageType: 'messages.messageType',
    deletedAt: 'messages.deletedAt',
  },
  tasks: {
    sourceMessageId: 'tasks.sourceMessageId',
    sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  isNull: mockIsNull,
}))

function routeParams() {
  return { params: Promise.resolve({ messageId: MESSAGE_ID }) }
}

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

describe('/api/messages/[messageId]/checkbox', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockToggleCheckboxAt.mockReturnValue('- [x] 候補A')
    mockDb.select.mockReset()
    mockDb.update.mockReset()
    mockEq.mockClear()
    mockAnd.mockClear()
    mockIsNull.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('poll メッセージは checkbox 変更できない', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          content: '- [ ] 候補A',
          channelId: 'channel-1',
          messageType: 'poll',
        },
      ]),
    )

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: 0, checked: true }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'poll メッセージのチェック変更はできません',
    })
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, 'channel-1')
    expect(mockToggleCheckboxAt).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('アクセス不可の poll メッセージは 403 を返す', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          content: '- [ ] 候補A',
          channelId: 'channel-1',
          messageType: 'poll',
        },
      ]),
    )
    mockRequireChannelAccess.mockResolvedValueOnce(
      Response.json({ error: 'forbidden' }, { status: 403 }),
    )

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: 0, checked: true }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' })
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, 'channel-1')
    expect(mockToggleCheckboxAt).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
