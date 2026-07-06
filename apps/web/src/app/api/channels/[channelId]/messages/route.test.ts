// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockCanAccessFile,
  mockDbSelect,
  mockDbTransaction,
  mockEq,
  mockIsNull,
  mockInArray,
  mockAnd,
  mockDesc,
  mockAsc,
  mockLte,
  mockGt,
  mockSafeParse,
  mockInngestSend,
  mockIsIndexable,
  mockTxUpdateSet,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockCanAccessFile: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
  mockInArray: vi.fn(() => Symbol('inArray')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockDesc: vi.fn(() => Symbol('desc')),
  mockAsc: vi.fn(() => Symbol('asc')),
  mockLte: vi.fn(() => Symbol('lte')),
  mockGt: vi.fn(() => Symbol('gt')),
  mockSafeParse: vi.fn(),
  mockInngestSend: vi.fn(() => Promise.resolve(undefined)),
  mockIsIndexable: vi.fn(),
  mockTxUpdateSet: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
  canAccessFile: mockCanAccessFile,
}))

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@/lib/chat/checkboxes', () => ({ parseCheckboxes: () => [] }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: mockIsIndexable }))
vi.mock('@cairn/shared', () => ({
  postMessageSchema: { safeParse: mockSafeParse },
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, transaction: mockDbTransaction },
  messages: {
    id: 'messages.id',
    content: 'messages.content',
    messageType: 'messages.messageType',
    parentMessageId: 'messages.parentMessageId',
    senderId: 'messages.senderId',
    createdAt: 'messages.createdAt',
    updatedAt: 'messages.updatedAt',
    channelId: 'messages.channelId',
    deletedAt: 'messages.deletedAt',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
    avatarUrl: 'workspaceMembers.avatarUrl',
  },
  messageReactions: {
    messageId: 'messageReactions.messageId',
    emoji: 'messageReactions.emoji',
    userId: 'messageReactions.userId',
  },
  messageAttachments: {
    id: 'messageAttachments.id',
    messageId: 'messageAttachments.messageId',
    fileId: 'messageAttachments.fileId',
    displayOrder: 'messageAttachments.displayOrder',
  },
  channels: {
    id: 'channels.id',
    projectId: 'channels.projectId',
  },
  tasks: {
    id: 'tasks.id',
  },
  messageBookmarks: {
    id: 'messageBookmarks.id',
    messageId: 'messageBookmarks.messageId',
    userId: 'messageBookmarks.userId',
  },
  files: {
    id: 'files.id',
    workspaceId: 'files.workspaceId',
    projectId: 'files.projectId',
    uploadedBy: 'files.uploadedBy',
    metadata: 'files.metadata',
    storagePath: 'files.storagePath',
    fileName: 'files.fileName',
    mimeType: 'files.mimeType',
    fileSize: 'files.fileSize',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  isNull: mockIsNull,
  inArray: mockInArray,
  and: mockAnd,
  desc: mockDesc,
  asc: mockAsc,
  lte: mockLte,
  gt: mockGt,
  sql: vi.fn(() => 'sql'),
}))

function ctxRouteParams() {
  return { params: Promise.resolve({ channelId: CHANNEL_ID }) }
}

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

describe('/api/channels/[channelId]/messages のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockSafeParse.mockReturnValue({ success: true, data: { content: 'hi', channelId: CHANNEL_ID } })
    mockIsIndexable.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('アクセス権の無いチャンネルでは GET が 403 を返し、メッセージを読めない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  it('アクセス権の無いチャンネルでは POST が 403 を返し、投稿できない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    })
    const res = await POST(req, ctxRouteParams())
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  it('GET はリアクションごとの参加者名を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults(
      [
        {
          id: 'msg-1',
          content: 'hello',
          senderId: 'user-2',
          senderName: 'Sender',
          senderAvatarUrl: null,
          createdAt: new Date('2026-06-24T01:00:00.000Z'),
          updatedAt: new Date('2026-06-24T01:00:00.000Z'),
        },
      ],
      [
        { messageId: 'msg-1', emoji: '👍', userId: DEV_USER_ID, userName: 'Kei' },
        { messageId: 'msg-1', emoji: '👍', userId: 'user-3', userName: 'Aki' },
      ],
      [],
      [],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'msg-1',
        reactions: [
          {
            emoji: '👍',
            count: 2,
            mine: true,
            userNames: ['Kei', 'Aki'],
          },
        ],
      }),
    ])
  })

  it('POST は添付アクセス判定へ pendingChannelId を渡す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockCanAccessFile.mockResolvedValue(true)
    mockSafeParse.mockReturnValue({
      success: true,
      data: {
        content: 'hi',
        channelId: CHANNEL_ID,
        attachmentFileIds: ['file-1'],
      },
    })
    mockSelectResults(
      [
        {
          id: 'file-1',
          workspaceId: DEV_WORKSPACE_ID,
          projectId: null,
          uploadedBy: DEV_USER_ID,
          metadata: { pendingChannelId: CHANNEL_ID },
          mimeType: 'text/plain',
          storagePath: 'workspace/channel/file.txt',
        },
      ],
      [
        {
          displayName: 'Kei',
          avatarUrl: null,
        },
      ],
    )
    mockDbTransaction.mockImplementation(async (
      callback: (tx: {
        insert: () => { values: () => { returning?: () => Promise<Array<{ id: string, content: string, senderId: string, createdAt: Date }>> } }
        update: () => { set: (value: unknown) => { where: () => Promise<unknown> } }
      }) => Promise<unknown>,
    ) => callback({
      insert: () => ({
        values: () => ({
          returning: async () => [{
            id: 'msg-1',
            content: 'hi',
            senderId: DEV_USER_ID,
            createdAt: new Date('2026-07-02T05:40:00.000Z'),
          }],
        }),
      }),
      update: () => ({
        set: (value: unknown) => {
          mockTxUpdateSet(value)
          return {
            where: async () => undefined,
          }
        },
      }),
    }))

    const { POST } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi', attachmentFileIds: ['file-1'] }),
    })
    const res = await POST(req, ctxRouteParams())

    expect(res.status).toBe(201)
    expect(mockCanAccessFile).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID,
      DEV_USER_ID,
      expect.objectContaining({ id: 'file-1', metadata: { pendingChannelId: CHANNEL_ID } }),
      { pendingChannelId: CHANNEL_ID },
    )
    expect(mockTxUpdateSet).toHaveBeenCalledWith({
      metadata: { channelIds: [CHANNEL_ID] },
    })
    expect(mockInngestSend).toHaveBeenCalledWith(expect.objectContaining({
      name: 'file/uploaded',
      data: expect.objectContaining({
        fileId: 'file-1',
        workspaceId: DEV_WORKSPACE_ID,
        mimeType: 'text/plain',
        storagePath: 'workspace/channel/file.txt',
      }),
    }))
  })

  it('POST は file/uploaded enqueue が失敗しても 201 を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockCanAccessFile.mockResolvedValue(true)
    mockSafeParse.mockReturnValue({
      success: true,
      data: {
        content: 'hi',
        channelId: CHANNEL_ID,
        attachmentFileIds: ['file-1'],
      },
    })
    mockSelectResults(
      [
        {
          id: 'file-1',
          workspaceId: DEV_WORKSPACE_ID,
          projectId: null,
          uploadedBy: DEV_USER_ID,
          metadata: { pendingChannelId: CHANNEL_ID },
          mimeType: 'text/plain',
          storagePath: 'workspace/channel/file.txt',
        },
      ],
      [
        {
          displayName: 'Kei',
          avatarUrl: null,
        },
      ],
    )
    mockDbTransaction.mockImplementation(async (
      callback: (tx: {
        insert: () => { values: () => { returning?: () => Promise<Array<{ id: string, content: string, senderId: string, createdAt: Date }>> } }
        update: () => { set: (value: unknown) => { where: () => Promise<unknown> } }
      }) => Promise<unknown>,
    ) => callback({
      insert: () => ({
        values: () => ({
          returning: async () => [{
            id: 'msg-1',
            content: 'hi',
            senderId: DEV_USER_ID,
            createdAt: new Date('2026-07-02T05:40:00.000Z'),
          }],
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockInngestSend
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('inngest down'))

    const { POST } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi', attachmentFileIds: ['file-1'] }),
    })
    const res = await POST(req, ctxRouteParams())

    expect(res.status).toBe(201)
    expect(warnSpy).toHaveBeenCalledWith(
      '[inngest] file/uploaded send failed (message already committed):',
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })
})
