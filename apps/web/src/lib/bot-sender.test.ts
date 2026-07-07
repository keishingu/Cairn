// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbSelect,
  mockDbTransaction,
  mockDbInsert,
  mockTxInsert,
  mockEq,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockDbInsert: vi.fn(),
  mockTxInsert: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockInngestSend: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
    insert: mockDbInsert,
  },
  workspaces: { id: 'workspaces.id', name: 'workspaces.name' },
  profiles: { id: 'profiles.id', kind: 'profiles.kind', displayName: 'profiles.displayName' },
  workspaceMembers: {
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
  },
  messages: {
    id: 'messages.id',
    content: 'messages.content',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
  },
  messageAttachments: { messageId: 'messageAttachments.messageId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mockInngestSend },
}))

function mockSelectResult(result: unknown) {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(result),
  }
  mockDbSelect.mockReturnValue(builder)
}

describe('bot sender helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('workspaceBotProfileId は同じ workspace から同じ UUID を生成する', async () => {
    const { workspaceBotProfileId } = await import('./bot-sender')

    expect(workspaceBotProfileId('10000000-0000-0000-0000-000000000001')).toBe(
      workspaceBotProfileId('10000000-0000-0000-0000-000000000001'),
    )
    expect(workspaceBotProfileId('10000000-0000-0000-0000-000000000001')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('ensureWorkspaceBotProfile は bot profile と workspace member を idempotent に用意する', async () => {
    mockSelectResult([{ name: 'Cairn' }])

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const insertBuilder = {
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate,
      }),
    }
    const memberInsertBuilder = {
      values: vi.fn().mockReturnValue({
        onConflictDoNothing,
      }),
    }
    mockTxInsert.mockReturnValue(insertBuilder)
    mockTxInsert.mockReturnValueOnce(insertBuilder).mockReturnValueOnce(memberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { ensureWorkspaceBotProfile, workspaceBotProfileId } = await import('./bot-sender')
    const result = await ensureWorkspaceBotProfile('10000000-0000-0000-0000-000000000001')

    expect(result).toEqual({
      id: workspaceBotProfileId('10000000-0000-0000-0000-000000000001'),
      displayName: 'Cairn Bot',
    })
    expect(mockTxInsert).toHaveBeenCalledTimes(2)
    expect(insertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({
      id: result.id,
      kind: 'bot',
      displayName: 'Cairn Bot',
    }))
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: 'profiles.id',
      set: { displayName: 'Cairn Bot' },
    })
  })

  it('postBotMessage は bot 名義の投稿を保存して message/created を送る', async () => {
    mockSelectResult([{ name: 'Cairn' }])

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const profileInsertBuilder = {
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate,
      }),
    }
    const workspaceMemberInsertBuilder = {
      values: vi.fn().mockReturnValue({
        onConflictDoNothing,
      }),
    }
    const attachmentValues = vi.fn().mockResolvedValue(undefined)
    const messageReturning = vi.fn().mockResolvedValue([{
      id: 'message-1',
      content: 'hello from bot',
      senderId: 'bot-1',
      createdAt: new Date('2026-07-07T00:00:00.000Z'),
    }])
    const messageInsertBuilder = {
      values: vi.fn().mockReturnValue({ returning: messageReturning }),
    }
    const attachmentInsertBuilder = {
      values: attachmentValues,
    }
    mockTxInsert
      .mockReturnValueOnce(profileInsertBuilder)
      .mockReturnValueOnce(workspaceMemberInsertBuilder)
      .mockReturnValueOnce(messageInsertBuilder)
      .mockReturnValueOnce(attachmentInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')
    const result = await postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1', 'file-2'],
    })

    expect(messageInsertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      messageType: 'text',
    }))
    expect(attachmentValues).toHaveBeenCalledWith([
      { messageId: 'message-1', fileId: 'file-1', displayOrder: 0 },
      { messageId: 'message-1', fileId: 'file-2', displayOrder: 1 },
    ])
    expect(mockInngestSend).toHaveBeenCalledWith(expect.objectContaining({
      name: 'message/created',
      data: expect.objectContaining({
        messageId: 'message-1',
        senderName: 'Cairn Bot',
      }),
    }))
    expect(result.senderKind).toBe('bot')
  })
})
