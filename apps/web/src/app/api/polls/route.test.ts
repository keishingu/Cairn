// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDb,
  mockEq,
  mockAnd,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDb: { transaction: vi.fn(), select: vi.fn() },
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/shared', async () => {
  const { z } = await import('zod')
  return {
    createPollSchema: z.object({
      channelId: z.string().uuid(),
      question: z.string().trim().min(1).max(500),
      options: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
      allowMultiple: z.boolean().default(false),
      anonymous: z.boolean().default(false),
    }),
  }
})
vi.mock('@cairn/db', () => ({
  db: mockDb,
  messages: { id: 'messages.id', createdAt: 'messages.createdAt' },
  polls: { id: 'polls.id' },
  pollOptions: {
    id: 'pollOptions.id',
    text: 'pollOptions.text',
    displayOrder: 'pollOptions.displayOrder',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  sql: Object.assign(
    vi.fn(() => 'sql'),
    { raw: vi.fn() },
  ),
}))

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  type SelectChain = {
    then: PromiseLike<unknown[]>['then']
    catch: Promise<unknown[]>['catch']
    finally: Promise<unknown[]>['finally']
    from: ReturnType<typeof vi.fn>
    leftJoin: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  const chain: SelectChain = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
  }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.leftJoin = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  return chain
}

describe('POST /api/polls', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDb.select.mockReturnValue(selectChain([{ displayName: 'Kei' }]))
    mockDb.transaction.mockImplementation(
      async (
        callback: (tx: {
          insert: (table: unknown) => {
            values: (value: unknown) => {
              returning: (selection: unknown) => Promise<unknown[]>
            }
          }
        }) => Promise<unknown>,
      ) => {
        let insertCount = 0
        const tx = {
          insert: () => ({
            values: () => ({
              returning: async () => {
                insertCount += 1
                if (insertCount === 1)
                  return [
                    {
                      id: 'message-1',
                      createdAt: new Date('2026-07-08T18:00:00.000Z'),
                    },
                  ]
                if (insertCount === 2) return [{ id: 'poll-1' }]
                return [
                  { id: 'option-1', text: '燕岳', displayOrder: 0 },
                  { id: 'option-2', text: '赤岳', displayOrder: 1 },
                ]
              },
            }),
          }),
        }
        return callback(tx)
      },
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('アクセス権の無いチャンネルでは 403 を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: CHANNEL_ID,
          question: '来月の山行先は？',
          options: ['燕岳', '赤岳'],
        }),
      }),
    )

    expect(res.status).toBe(403)
  })

  it('選択肢が1件だけだと 422 を返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: CHANNEL_ID,
          question: '来月の山行先は？',
          options: ['燕岳'],
        }),
      }),
    )

    expect(res.status).toBe(422)
  })

  it('poll メッセージと投票本体を同時に作成する', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: CHANNEL_ID,
          question: '来月の山行先は？',
          options: ['燕岳', '赤岳'],
          allowMultiple: false,
          anonymous: true,
        }),
      }),
    )

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({
      id: 'poll-1',
      messageId: 'message-1',
      channelId: CHANNEL_ID,
      question: '来月の山行先は？',
      allowMultiple: false,
      anonymous: true,
      options: [
        { id: 'option-1', text: '燕岳', displayOrder: 0 },
        { id: 'option-2', text: '赤岳', displayOrder: 1 },
      ],
      createdAt: '2026-07-08T18:00:00.000Z',
    })
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'message/created',
        data: expect.objectContaining({
          messageId: 'message-1',
          channelId: CHANNEL_ID,
          senderId: USER_ID,
          senderName: 'Kei',
          content: '来月の山行先は？',
        }),
      }),
    )
  })
})
