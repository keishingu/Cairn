// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'
const OPTION_ID_1 = '30000000-0000-0000-0000-000000000001'
const OPTION_ID_2 = '30000000-0000-0000-0000-000000000002'
const OPTION_ID_404 = '39999999-0000-0000-0000-000000000404'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbTransaction,
  mockEq,
  mockAnd,
  mockOr,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockOr: vi.fn(() => Symbol('or')),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@cairn/shared', async () => {
  const { z } = await import('zod')
  return {
    votePollSchema: z.object({
      optionIds: z.array(z.string().uuid()),
    }),
  }
})
vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
  polls: {
    id: 'polls.id',
    channelId: 'polls.channelId',
    allowMultiple: 'polls.allowMultiple',
    messageId: 'polls.messageId',
  },
  pollOptions: {
    id: 'pollOptions.id',
    pollId: 'pollOptions.pollId',
  },
  pollVotes: {
    pollId: 'pollVotes.pollId',
    userId: 'pollVotes.userId',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  or: mockOr,
}))

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder: Record<string, unknown> = {
      from: () => builder,
      where: () => builder,
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

function routeParams(id = 'poll-1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/polls/[id]/vote', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDbTransaction.mockImplementation(async (callback: (tx: {
      delete: () => { where: () => Promise<void> }
      insert: () => { values: () => Promise<void> }
    }) => Promise<void>) => {
      const tx = {
        delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      }
      await callback(tx)
      return undefined
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('単一選択で複数 optionIds を送ると 422 を返す', async () => {
    mockSelectResults(
      [{ id: 'poll-1', channelId: CHANNEL_ID, allowMultiple: false, messageId: 'message-1' }],
    )

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls/poll-1/vote', {
        method: 'POST',
        body: JSON.stringify({ optionIds: [OPTION_ID_1, OPTION_ID_2] }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(422)
  })

  it('現在の票を置き換えて保存する', async () => {
    const txRecorder = {
      deleteCalled: false,
      insertCalled: false,
    }
    mockDbTransaction.mockImplementation(async (callback: (tx: {
      delete: ReturnType<typeof vi.fn>
      insert: ReturnType<typeof vi.fn>
    }) => Promise<void>) => {
      const tx = {
        delete: vi.fn(() => {
          txRecorder.deleteCalled = true
          return { where: vi.fn().mockResolvedValue(undefined) }
        }),
        insert: vi.fn(() => {
          txRecorder.insertCalled = true
          return { values: vi.fn().mockResolvedValue(undefined) }
        }),
      }
      await callback(tx)
      return undefined
    })
    mockSelectResults(
      [{ id: 'poll-1', channelId: CHANNEL_ID, allowMultiple: true, messageId: 'message-1' }],
      [{ id: OPTION_ID_1 }, { id: OPTION_ID_2 }],
    )

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls/poll-1/vote', {
        method: 'POST',
        body: JSON.stringify({ optionIds: [OPTION_ID_1, OPTION_ID_2] }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: 'poll-1',
      optionIds: [OPTION_ID_1, OPTION_ID_2],
    })
    expect(txRecorder.deleteCalled).toBe(true)
    expect(txRecorder.insertCalled).toBe(true)
  })

  it('存在しない選択肢を含むと 422 を返す', async () => {
    mockSelectResults(
      [{ id: 'poll-1', channelId: CHANNEL_ID, allowMultiple: true, messageId: 'message-1' }],
      [{ id: OPTION_ID_1 }],
    )

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls/poll-1/vote', {
        method: 'POST',
        body: JSON.stringify({ optionIds: [OPTION_ID_404] }),
      }),
      routeParams(),
    )

    expect(res.status).toBe(422)
  })

  it('messageId でも投票を更新できる', async () => {
    mockSelectResults(
      [{ id: 'poll-1', channelId: CHANNEL_ID, allowMultiple: true, messageId: 'message-1' }],
      [{ id: OPTION_ID_1 }],
    )

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls/message-1/vote', {
        method: 'POST',
        body: JSON.stringify({ optionIds: [OPTION_ID_1] }),
      }),
      routeParams('message-1'),
    )

    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('polls.messageId', 'message-1')
    expect(mockOr).toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({
      id: 'poll-1',
      optionIds: [OPTION_ID_1],
    })
  })
})
