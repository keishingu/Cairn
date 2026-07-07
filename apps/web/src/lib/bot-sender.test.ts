// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbSelect,
  mockDbTransaction,
  mockDbInsert,
  mockTxInsert,
  mockEq,
  mockAnd,
  mockInArray,
  mockIsNull,
  mockSql,
  mockInngestSend,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockDbInsert: vi.fn(),
  mockTxInsert: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockInArray: vi.fn(() => Symbol('inArray')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
  mockSql: vi.fn(() => Symbol('sql')),
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
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', projectId: 'channels.projectId' },
  files: {
    id: 'files.id',
    workspaceId: 'files.workspaceId',
    projectId: 'files.projectId',
    fileType: 'files.fileType',
    storagePath: 'files.storagePath',
    metadata: 'files.metadata',
  },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  workspaceMembers: {
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
  },
  messages: {
    id: 'messages.id',
    channelId: 'messages.channelId',
    deletedAt: 'messages.deletedAt',
    content: 'messages.content',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
  },
  messageAttachments: { messageId: 'messageAttachments.messageId', fileId: 'messageAttachments.fileId' },
}))

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
  inArray: mockInArray,
  isNull: mockIsNull,
  sql: mockSql,
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mockInngestSend },
}))

function mockSelectResult(result: unknown) {
  const builder = {
    from: () => builder,
    leftJoin: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(result),
  }
  mockDbSelect.mockReturnValueOnce(builder)
}

describe('bot sender helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReset()
    mockDbTransaction.mockReset()
    mockDbInsert.mockReset()
    mockTxInsert.mockReset()
    mockEq.mockReset().mockReturnValue(Symbol('eq'))
    mockAnd.mockReset().mockReturnValue(Symbol('and'))
    mockInArray.mockReset().mockReturnValue(Symbol('inArray'))
    mockIsNull.mockReset().mockReturnValue(Symbol('isNull'))
    mockSql.mockReset().mockReturnValue(Symbol('sql'))
    mockInngestSend.mockReset().mockResolvedValue(undefined)
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
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([
      {
        id: 'file-1',
        workspaceId: '10000000-0000-0000-0000-000000000001',
        projectId: null,
        fileType: 'document',
        storagePath: '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/file-1.png',
        metadata: {},
      },
      {
        id: 'file-2',
        workspaceId: '10000000-0000-0000-0000-000000000001',
        projectId: null,
        fileType: 'document',
        storagePath: '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/file-2.png',
        metadata: {},
      },
    ])
    mockSelectResult([{ id: 'parent-1' }])

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
      parentMessageId: 'parent-1',
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

  it('postBotMessage は別 workspace の channel を拒否する', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: 'another-workspace', projectId: null }])

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
    mockTxInsert.mockReturnValueOnce(profileInsertBuilder).mockReturnValueOnce(workspaceMemberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
    })).rejects.toThrow('Bot post target channel does not belong to workspace')
    expect(mockDbTransaction).toHaveBeenCalledTimes(1)
  })

  it('postBotMessage は別 workspace の attachment を拒否する', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([{
      id: 'file-1',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      projectId: null,
      fileType: 'document',
      storagePath: '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/file-1.png',
      metadata: {},
    }])

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
    mockTxInsert.mockReturnValueOnce(profileInsertBuilder).mockReturnValueOnce(workspaceMemberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1', 'file-2'],
    })).rejects.toThrow('Bot post attachment does not belong to workspace')
    expect(mockDbTransaction).toHaveBeenCalledTimes(1)
  })

  it('postBotMessage は別 project の attachment を project channel へ流し込ませない', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: 'project-1' }])
    mockSelectResult([{
      id: 'file-1',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      projectId: 'project-2',
      fileType: 'document',
      storagePath: '10000000-0000-0000-0000-000000000001/another-channel/file-1.png',
      metadata: {},
    }])

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
    mockTxInsert.mockReturnValueOnce(profileInsertBuilder).mockReturnValueOnce(workspaceMemberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1'],
    })).rejects.toThrow('Bot post attachment is not accessible from target project')
  })

  it('postBotMessage は別 channel 由来の workspace attachment を private channel へ流し込ませない', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([{
      id: 'file-1',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      projectId: null,
      fileType: 'document',
      storagePath: '10000000-0000-0000-0000-000000000001/another-channel/file-1.png',
      metadata: {},
    }])
    mockSelectResult([])

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
    mockTxInsert.mockReturnValueOnce(profileInsertBuilder).mockReturnValueOnce(workspaceMemberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1'],
    })).rejects.toThrow('Bot post attachment is not accessible from target channel')
  })

  it('postBotMessage は別 channel の親メッセージを返信先にできない', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([])

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
    mockTxInsert.mockReturnValueOnce(profileInsertBuilder).mockReturnValueOnce(workspaceMemberInsertBuilder)
    mockDbTransaction.mockImplementation(async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) => {
      return fn({ insert: mockTxInsert })
    })

    const { postBotMessage } = await import('./bot-sender')

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      parentMessageId: 'parent-404',
    })).rejects.toThrow('Bot reply target message is not accessible from target channel')
  })

  it('postBotMessage は同じ channel に紐づく link attachment を許可する', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([{
      id: 'file-1',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      projectId: null,
      fileType: 'link',
      storagePath: null,
      metadata: { channelIds: ['20000000-0000-0000-0000-000000000001'] },
    }])

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
    const messageReturning = vi.fn().mockResolvedValue([{
      id: 'message-1',
      content: 'hello from bot',
      senderId: 'bot-1',
      createdAt: new Date('2026-07-07T00:00:00.000Z'),
    }])
    const messageInsertBuilder = {
      values: vi.fn().mockReturnValue({ returning: messageReturning }),
    }
    const attachmentValues = vi.fn().mockResolvedValue(undefined)
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

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1'],
    })).resolves.toMatchObject({ id: 'message-1' })
    expect(attachmentValues).toHaveBeenCalledWith([
      { messageId: 'message-1', fileId: 'file-1', displayOrder: 0 },
    ])
  })

  it('postBotMessage は同じ channel に既に添付済みの file を許可する', async () => {
    mockSelectResult([{ name: 'Cairn' }])
    mockSelectResult([{ effectiveWorkspaceId: '10000000-0000-0000-0000-000000000001', projectId: null }])
    mockSelectResult([{
      id: 'file-1',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      projectId: null,
      fileType: 'document',
      storagePath: '10000000-0000-0000-0000-000000000001/another-channel/file-1.png',
      metadata: {},
    }])
    mockSelectResult([{ messageId: 'existing-message-1' }])

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
    const messageReturning = vi.fn().mockResolvedValue([{
      id: 'message-1',
      content: 'hello from bot',
      senderId: 'bot-1',
      createdAt: new Date('2026-07-07T00:00:00.000Z'),
    }])
    const messageInsertBuilder = {
      values: vi.fn().mockReturnValue({ returning: messageReturning }),
    }
    const attachmentValues = vi.fn().mockResolvedValue(undefined)
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

    await expect(postBotMessage({
      workspaceId: '10000000-0000-0000-0000-000000000001',
      channelId: '20000000-0000-0000-0000-000000000001',
      content: 'hello from bot',
      attachmentFileIds: ['file-1'],
    })).resolves.toMatchObject({ id: 'message-1' })
    expect(attachmentValues).toHaveBeenCalledWith([
      { messageId: 'message-1', fileId: 'file-1', displayOrder: 0 },
    ])
  })
})
