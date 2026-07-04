// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  USER_ID,
  WORKSPACE_ID,
  CHANNEL_ID,
  POLL_ID,
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDb,
} = vi.hoisted(() => {
  const USER_ID = '00000000-0000-0000-0000-000000000001'
  const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'
  const CHANNEL_ID = '00000000-0000-0000-0000-000000000020'
  const POLL_ID = '00000000-0000-0000-0000-000000000030'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
    error: null,
  })
  const mockRequireChannelAccess = vi.fn().mockResolvedValue(null)
  const mockDb = {
    select: vi.fn(),
  }
  return { USER_ID, WORKSPACE_ID, CHANNEL_ID, POLL_ID, mockGetAuthContext, mockRequireChannelAccess, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  polls: {
    id: 'polls.id',
    channelId: 'polls.channelId',
    messageId: 'polls.messageId',
    question: 'polls.question',
    allowMultiple: 'polls.allowMultiple',
    anonymous: 'polls.anonymous',
    closesAt: 'polls.closesAt',
    createdAt: 'polls.createdAt',
  },
  pollOptions: {
    id: 'pollOptions.id',
    pollId: 'pollOptions.pollId',
    label: 'pollOptions.label',
    position: 'pollOptions.position',
  },
  pollVotes: {
    optionId: 'pollVotes.optionId',
    userId: 'pollVotes.userId',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

function selectSingle(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }
}

function selectWithJoin(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('GET /api/polls/[id]', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  it('anonymous=false では投票者一覧を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(selectSingle([{
        id: POLL_ID,
        channelId: CHANNEL_ID,
        messageId: 'msg-1',
        question: 'どっちでやる？',
        allowMultiple: false,
        anonymous: false,
        closesAt: null,
        createdAt: new Date('2026-07-04T01:00:00.000Z'),
      }]))
      .mockReturnValueOnce(selectChain([
        { id: 'opt-1', label: 'オンライン', position: 0 },
        { id: 'opt-2', label: '対面', position: 1 },
      ]))
      .mockReturnValueOnce(selectWithJoin([
        { optionId: 'opt-1', userId: 'user-a', displayName: 'Alice' },
        { optionId: 'opt-1', userId: 'user-b', displayName: 'Bob' },
      ]))

    const { GET } = await import('./route')
    const res = await GET(new Request(`http://localhost/api/polls/${POLL_ID}`), {
      params: Promise.resolve({ id: POLL_ID }),
    })

    expect(res.status).toBe(200)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CHANNEL_ID)

    const body = await res.json() as {
      options: Array<{ id: string; voteCount: number; voters: Array<{ userId: string; displayName: string }> }>
    }
    expect(body.options).toEqual([
      {
        id: 'opt-1',
        label: 'オンライン',
        position: 0,
        voteCount: 2,
        voters: [
          { userId: 'user-a', displayName: 'Alice' },
          { userId: 'user-b', displayName: 'Bob' },
        ],
      },
      {
        id: 'opt-2',
        label: '対面',
        position: 1,
        voteCount: 0,
        voters: [],
      },
    ])
  })

  it('anonymous=true では票数だけ返す', async () => {
    mockDb.select
      .mockReturnValueOnce(selectSingle([{
        id: POLL_ID,
        channelId: CHANNEL_ID,
        messageId: 'msg-1',
        question: 'どっちでやる？',
        allowMultiple: true,
        anonymous: true,
        closesAt: null,
        createdAt: new Date('2026-07-04T01:00:00.000Z'),
      }]))
      .mockReturnValueOnce(selectChain([
        { id: 'opt-1', label: 'オンライン', position: 0 },
      ]))
      .mockReturnValueOnce(selectWithJoin([
        { optionId: 'opt-1', userId: 'user-a', displayName: 'Alice' },
      ]))

    const { GET } = await import('./route')
    const res = await GET(new Request(`http://localhost/api/polls/${POLL_ID}`), {
      params: Promise.resolve({ id: POLL_ID }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as {
      anonymous: boolean
      options: Array<{ voteCount: number; voters: Array<{ userId: string; displayName: string }> }>
    }
    expect(body.anonymous).toBe(true)
    expect(body.options[0]).toEqual({
      id: 'opt-1',
      label: 'オンライン',
      position: 0,
      voteCount: 1,
      voters: [],
    })
  })
})
