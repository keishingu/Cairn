// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  USER_ID,
  WORKSPACE_ID,
  CHANNEL_ID,
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDb,
  mockTx,
  mockInngestSend,
} = vi.hoisted(() => {
  const USER_ID = '00000000-0000-0000-0000-000000000001'
  const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'
  const CHANNEL_ID = '00000000-0000-0000-0000-000000000020'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
    error: null,
  })
  const mockRequireChannelAccess = vi.fn().mockResolvedValue(null)
  const mockDb = {
    transaction: vi.fn(),
    select: vi.fn(),
  }
  const mockTx = {
    insert: vi.fn(),
  }
  const mockInngestSend = vi.fn().mockResolvedValue(undefined)
  return { USER_ID, WORKSPACE_ID, CHANNEL_ID, mockGetAuthContext, mockRequireChannelAccess, mockDb, mockTx, mockInngestSend }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  messages: {
    id: 'messages.id',
  },
  polls: {
    id: 'polls.id',
  },
  pollOptions: {},
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
  },
}))

function insertReturning(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  }
}

function insertValuesOnly() {
  return {
    values: vi.fn().mockResolvedValue([]),
  }
}

function selectWithProfile(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('POST /api/polls', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
  })

  it('投票メッセージと poll を同一トランザクションで作成する', async () => {
    mockTx.insert
      .mockReturnValueOnce(insertReturning([{ id: 'msg-1' }]))
      .mockReturnValueOnce(insertReturning([{ id: 'poll-1' }]))
      .mockReturnValueOnce(insertValuesOnly())

    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
    mockDb.select.mockReturnValueOnce(selectWithProfile([{ displayName: 'Alice' }]))

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        channelId: CHANNEL_ID,
        question: '来週の定例はどこでやる？',
        options: ['オンライン', '対面'],
        allowMultiple: true,
        anonymous: true,
      }),
    }))

    expect(res.status).toBe(201)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CHANNEL_ID)
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(mockTx.insert).toHaveBeenCalledTimes(3)
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'message/created',
      data: {
        messageId: 'msg-1',
        channelId: CHANNEL_ID,
        workspaceId: WORKSPACE_ID,
        senderId: USER_ID,
        senderName: 'Alice',
        content: '来週の定例はどこでやる？',
        attachmentFileIds: [],
      },
    })

    const messageValues = mockTx.insert.mock.calls[0]?.[0]
    expect(messageValues).toBeTruthy()
    const pollValues = mockTx.insert.mock.calls[1]?.[0]
    expect(pollValues).toBeTruthy()

    const body = await res.json() as { pollId: string; messageId: string }
    expect(body).toEqual({ pollId: 'poll-1', messageId: 'msg-1' })
  })

  it('不正な payload なら 422 を返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/polls', {
      method: 'POST',
      body: JSON.stringify({
        channelId: CHANNEL_ID,
        question: '',
        options: [],
      }),
    }))

    expect(res.status).toBe(422)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})
