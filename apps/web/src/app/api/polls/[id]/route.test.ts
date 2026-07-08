// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockEq,
  mockAnd,
  mockInArray,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockInArray: vi.fn(() => Symbol('inArray')),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  polls: {
    id: 'polls.id',
    channelId: 'polls.channelId',
    messageId: 'polls.messageId',
    question: 'polls.question',
    allowMultiple: 'polls.allowMultiple',
    anonymous: 'polls.anonymous',
    createdBy: 'polls.createdBy',
    createdAt: 'polls.createdAt',
  },
  pollOptions: {
    id: 'pollOptions.id',
    pollId: 'pollOptions.pollId',
    text: 'pollOptions.text',
    displayOrder: 'pollOptions.displayOrder',
  },
  pollVotes: {
    pollId: 'pollVotes.pollId',
    optionId: 'pollVotes.optionId',
    userId: 'pollVotes.userId',
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
  inArray: mockInArray,
  sql: Object.assign(
    vi.fn(() => 'sql'),
    { raw: vi.fn() },
  ),
}))

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
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

describe('GET /api/polls/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('アクセス権の無いチャンネルでは 403 を返す', async () => {
    mockSelectResults([
      {
        id: 'poll-1',
        channelId: CHANNEL_ID,
        messageId: 'message-1',
        question: '来月の山行先は？',
        allowMultiple: false,
        anonymous: false,
        createdBy: USER_ID,
        createdAt: new Date('2026-07-08T18:00:00.000Z'),
      },
    ])
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { GET } = await import('./route')
    const res = await GET(
      new Request('http://localhost/api/polls/poll-1'),
      routeParams(),
    )

    expect(res.status).toBe(403)
  })

  it('anonymous poll は票数だけ返し、投票者一覧を隠す', async () => {
    mockSelectResults(
      [
        {
          id: 'poll-1',
          channelId: CHANNEL_ID,
          messageId: 'message-1',
          question: '来月の山行先は？',
          allowMultiple: false,
          anonymous: true,
          createdBy: USER_ID,
          createdAt: new Date('2026-07-08T18:00:00.000Z'),
        },
      ],
      [
        { id: 'option-1', text: '燕岳', displayOrder: 0 },
        { id: 'option-2', text: '赤岳', displayOrder: 1 },
      ],
      [{ optionId: 'option-1', userId: USER_ID }],
    )

    const { GET } = await import('./route')
    const res = await GET(
      new Request('http://localhost/api/polls/poll-1'),
      routeParams(),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: 'poll-1',
      channelId: CHANNEL_ID,
      messageId: 'message-1',
      question: '来月の山行先は？',
      allowMultiple: false,
      anonymous: true,
      createdBy: USER_ID,
      createdAt: '2026-07-08T18:00:00.000Z',
      options: [
        {
          id: 'option-1',
          text: '燕岳',
          displayOrder: 0,
          voteCount: 1,
          voters: [],
        },
        {
          id: 'option-2',
          text: '赤岳',
          displayOrder: 1,
          voteCount: 0,
          voters: [],
        },
      ],
    })
  })

  it('non-anonymous poll は投票者表示名も返す', async () => {
    mockSelectResults(
      [
        {
          id: 'poll-1',
          channelId: CHANNEL_ID,
          messageId: 'message-1',
          question: '来月の山行先は？',
          allowMultiple: false,
          anonymous: false,
          createdBy: USER_ID,
          createdAt: new Date('2026-07-08T18:00:00.000Z'),
        },
      ],
      [
        { id: 'option-1', text: '燕岳', displayOrder: 0 },
        { id: 'option-2', text: '赤岳', displayOrder: 1 },
      ],
      [
        { optionId: 'option-1', userId: USER_ID },
        {
          optionId: 'option-1',
          userId: '00000000-0000-0000-0000-000000000002',
        },
      ],
      [
        { userId: USER_ID, displayName: 'Kei' },
        { userId: '00000000-0000-0000-0000-000000000002', displayName: 'Aki' },
      ],
    )

    const { GET } = await import('./route')
    const res = await GET(
      new Request('http://localhost/api/polls/poll-1'),
      routeParams(),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        options: [
          {
            id: 'option-1',
            text: '燕岳',
            displayOrder: 0,
            voteCount: 2,
            voters: [
              { userId: USER_ID, displayName: 'Kei' },
              {
                userId: '00000000-0000-0000-0000-000000000002',
                displayName: 'Aki',
              },
            ],
          },
          {
            id: 'option-2',
            text: '赤岳',
            displayOrder: 1,
            voteCount: 0,
            voters: [],
          },
        ],
      }),
    )
  })
})
