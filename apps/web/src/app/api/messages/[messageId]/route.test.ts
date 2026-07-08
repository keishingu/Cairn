// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDb,
  mockEq,
  mockAnd,
  mockIsNull,
  mockInArray,
  mockCanonicalizeMentions,
  mockParseCheckboxes,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
  mockInArray: vi.fn(() => Symbol('inArray')),
  mockCanonicalizeMentions: vi.fn((value: string) => value),
  mockParseCheckboxes: vi.fn(() => []),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/chat/mentions', () => ({
  canonicalizeMentions: mockCanonicalizeMentions,
}))
vi.mock('@/lib/chat/checkboxes', () => ({
  parseCheckboxes: mockParseCheckboxes,
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  messages: {
    id: 'messages.id',
    content: 'messages.content',
    messageType: 'messages.messageType',
    channelId: 'messages.channelId',
    senderId: 'messages.senderId',
    deletedAt: 'messages.deletedAt',
    updatedAt: 'messages.updatedAt',
  },
  channels: {
    id: 'channels.id',
    workspaceId: 'channels.workspaceId',
    projectId: 'channels.projectId',
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
  inArray: mockInArray,
}))

function routeParams() {
  return { params: Promise.resolve({ messageId: MESSAGE_ID }) }
}

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

describe('/api/messages/[messageId]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('poll メッセージは PATCH できない', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: MESSAGE_ID,
          content: '来月の山行先は？',
          messageType: 'poll',
        },
      ]),
    )

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request(`http://localhost/api/messages/${MESSAGE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '書き換えたい' }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'poll メッセージは編集できません',
    })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('poll メッセージは DELETE できない', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: MESSAGE_ID,
          messageType: 'poll',
        },
      ]),
    )

    const { DELETE } = await import('./route')
    const res = await DELETE(
      new Request(`http://localhost/api/messages/${MESSAGE_ID}`, {
        method: 'DELETE',
      }),
      routeParams(),
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'poll メッセージは削除できません',
    })
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
