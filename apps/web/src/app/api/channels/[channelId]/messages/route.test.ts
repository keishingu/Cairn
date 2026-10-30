// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockCanAccessFile,
  mockCanAccessChannel,
  mockLoadFamily,
  mockDbSelect,
  mockEq,
  mockIsNull,
  mockInArray,
  mockAnd,
  mockOr,
  mockDesc,
  mockAsc,
  mockLte,
  mockLt,
  mockGt,
  mockGetProfileAttributes,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockCanAccessFile: vi.fn(),
  mockCanAccessChannel: vi.fn(),
  mockLoadFamily: vi.fn(),
  mockDbSelect: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockIsNull: vi.fn(() => Symbol('isNull')),
  mockInArray: vi.fn(() => Symbol('inArray')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockOr: vi.fn(() => Symbol('or')),
  mockDesc: vi.fn(() => Symbol('desc')),
  mockAsc: vi.fn(() => Symbol('asc')),
  mockLte: vi.fn(() => Symbol('lte')),
  mockLt: vi.fn(() => Symbol('lt')),
  mockGt: vi.fn(() => Symbol('gt')),
  mockGetProfileAttributes: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
  canAccessFile: mockCanAccessFile,
  canAccessChannel: mockCanAccessChannel,
}))
vi.mock('@/lib/chat/channel-family', () => ({ loadChannelFamilyIds: mockLoadFamily }))

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/profile-attributes', () => ({ getProfileAttributesByUserIds: mockGetProfileAttributes }))
vi.mock('@cairn/shared', () => ({
  formatTaskTitleForDisplay: (title: string) => title,
  postMessageSchema: {
    safeParse: () => ({ success: true, data: { content: 'hi', channelId: CHANNEL_ID } }),
  },
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
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
    profileAttributes: 'workspaceMembers.profileAttributes',
  },
  channels: { id: 'channels.id', projectId: 'channels.projectId' },
  projectMembers: {
    userId: 'projectMembers.userId',
    projectId: 'projectMembers.projectId',
    role: 'projectMembers.role',
    roleId: 'projectMembers.roleId',
  },
  projectRoles: {
    id: 'projectRoles.id',
    workspaceId: 'projectRoles.workspaceId',
    name: 'projectRoles.name',
    color: 'projectRoles.color',
    legacyRole: 'projectRoles.legacyRole',
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
  messageBookmarks: {
    id: 'messageBookmarks.id',
    messageId: 'messageBookmarks.messageId',
    userId: 'messageBookmarks.userId',
  },
  tasks: {
    id: 'tasks.id',
    status: 'tasks.status',
    sourceMessageId: 'tasks.sourceMessageId',
    sourceLine: 'tasks.sourceLine',
    sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
    workspaceId: 'tasks.workspaceId',
    createdAt: 'tasks.createdAt',
  },
  userBlocks: {
    blockerId: 'userBlocks.blockerId',
    blockedId: 'userBlocks.blockedId',
  },
  files: {
    id: 'files.id',
    fileName: 'files.fileName',
    mimeType: 'files.mimeType',
    fileSize: 'files.fileSize',
  },
  messageBlocks: { messageId: 'messageBlocks.messageId', blocks: 'messageBlocks.blocks' },
  appInstallations: {
    appId: 'appInstallations.appId',
    botProfileId: 'appInstallations.botProfileId',
    workspaceId: 'appInstallations.workspaceId',
    revokedAt: 'appInstallations.revokedAt',
  },
  apps: { id: 'apps.id', name: 'apps.name', iconUrl: 'apps.iconUrl' },
}))
vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  isNull: mockIsNull,
  inArray: mockInArray,
  and: mockAnd,
  or: mockOr,
  desc: mockDesc,
  asc: mockAsc,
  lte: mockLte,
  lt: mockLt,
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
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockGetProfileAttributes.mockResolvedValue(new Map([['user-2', [
      { id: 'attribute-1', name: '3年生', color: 'blue' },
      { id: 'attribute-2', name: '経済学部', color: 'emerald' },
    ]]]))
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
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID, 'member')
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
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID, 'member')
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
          senderProjectRole: 'subleader',
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
      [],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'msg-1',
        senderProfileAttributes: [
          { id: 'attribute-1', name: '3年生', color: 'blue' },
          { id: 'attribute-2', name: '経済学部', color: 'emerald' },
        ],
        senderProjectRole: 'subleader',
        senderProjectRoleName: null,
        senderProjectRoleColor: null,
        senderProjectRoleLegacy: null,
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

  it('GET は設定済みのプロジェクト役割名と色を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults(
      [
        {
          id: 'msg-1',
          content: 'hello',
          senderId: 'user-2',
          senderName: 'Sender',
          senderAvatarUrl: null,
          senderProjectRole: 'member',
          senderProjectRoleName: 'デザイナー',
          senderProjectRoleColor: '#EC4899',
          senderProjectRoleLegacy: null,
          createdAt: new Date('2026-06-24T01:00:00.000Z'),
          updatedAt: new Date('2026-06-24T01:00:00.000Z'),
        },
      ],
      [],
      [],
      [],
      [],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        senderProjectRole: 'member',
        senderProjectRoleName: 'デザイナー',
        senderProjectRoleColor: '#EC4899',
        senderProjectRoleLegacy: null,
      }),
    ])
  })

  it('GET はアプリのカードをボタンの value を除いて返し、送信者のアプリを付ける', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults(
      [
        {
          id: 'msg-card',
          content: '11月の登山本部 担当決め',
          messageType: 'blocks',
          senderId: 'bot-profile',
          senderName: '投票',
          senderAvatarUrl: null,
          createdAt: new Date('2026-10-21T01:00:00.000Z'),
          updatedAt: new Date('2026-10-21T01:00:00.000Z'),
          blocks: [
            {
              type: 'section',
              block_id: 'option-1',
              text: { type: 'plain_text', text: '第1週' },
              accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' }, value: 'option:1' },
            },
          ],
          appName: 'Polls',
          appSlug: 'polls',
          appOwnerWorkspaceId: null,
          appIconUrl: 'https://example.com/polls.png',
          appRevokedAt: null,
        },
        {
          id: 'msg-human',
          content: 'hello',
          messageType: 'text',
          senderId: 'user-2',
          senderName: 'Sender',
          senderAvatarUrl: null,
          createdAt: new Date('2026-10-21T01:01:00.000Z'),
          updatedAt: new Date('2026-10-21T01:01:00.000Z'),
          blocks: null,
          appName: null,
          appIconUrl: null,
          appRevokedAt: null,
        },
      ].reverse(),
      [],
      [],
      [],
      [],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      expect.objectContaining({
        id: 'msg-card',
        isEdited: false,
        blocks: [
          {
            type: 'section',
            block_id: 'option-1',
            text: { type: 'plain_text', text: '第1週' },
            accessory: { type: 'button', action_id: 'vote', text: { type: 'plain_text', text: '投票' } },
          },
        ],
        senderApp: { name: 'Polls', firstParty: true, iconUrl: 'https://example.com/polls.png', uninstalled: false },
        mentionNames: {},
      }),
      expect.objectContaining({ id: 'msg-human', blocks: null, senderApp: null }),
    ])
  })

  it('GET はタスク化済みのメッセージに作成順のタスク一覧を linkedTasks として付け、行番号を lineIndex に入れる', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    const base = {
      content: 'hello',
      senderId: 'user-2',
      senderName: 'Sender',
      senderAvatarUrl: null,
      createdAt: new Date('2026-06-24T01:00:00.000Z'),
      updatedAt: new Date('2026-06-24T01:00:00.000Z'),
    }
    const lineKey = (raw: string) => createHash('sha256').update(raw).digest('hex')
    mockSelectResults(
      // DB は新しい順で返し、実装が時系列に並べ替える
      [{ ...base, id: 'msg-2' }, { ...base, id: 'msg-1', content: '前置き\n\n- 資料を確認\n- [ ] 日程調整\n```\n- 消えた行\n```' }],
      [],
      [],
      [],
      // createdAt 昇順で返るので、そのまま作成順に並ぶ
      [
        { id: 'task-1', title: '資料を確認', status: 'done', sourceMessageId: 'msg-1', sourceLine: lineKey('資料を確認'), sourceCheckboxIndex: null },
        // 旧チェックボックス由来（source_line なし）
        { id: 'task-2', title: '日程調整', status: 'todo', sourceMessageId: 'msg-1', sourceLine: null, sourceCheckboxIndex: 0 },
        // 本文から消えた行（コードフェンス内）
        { id: 'task-3', title: '消えた行', status: 'todo', sourceMessageId: 'msg-1', sourceLine: lineKey('消えた行'), sourceCheckboxIndex: null },
      ],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: 'msg-1', linkedTasks: [
        { id: 'task-1', title: '資料を確認', status: 'done', lineIndex: 2 },
        { id: 'task-2', title: '日程調整', status: 'todo', lineIndex: 3 },
        { id: 'task-3', title: '消えた行', status: 'todo', lineIndex: null },
      ] }),
      expect.objectContaining({ id: 'msg-2', linkedTasks: [] }),
    ])
    expect(mockEq).toHaveBeenCalledWith('tasks.workspaceId', DEV_WORKSPACE_ID)
  })

  it('直近ページでは101件目を除外し、次ページの有無をヘッダーで返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `message-${101 - index}`,
      content: `message ${101 - index}`,
      messageType: 'text',
      parentMessageId: null,
      senderId: 'user-2',
      senderName: 'Sender',
      senderAvatarUrl: null,
      createdAt: new Date(`2026-01-01T00:${String(59 - (index % 60)).padStart(2, '0')}:00.000Z`),
      updatedAt: new Date(`2026-01-01T00:${String(59 - (index % 60)).padStart(2, '0')}:00.000Z`),
    }))
    mockSelectResults(rows, [], [], [], [])

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())

    expect(res.headers.get('X-Cairn-Has-More')).toBe('true')
    await expect(res.json()).resolves.toHaveLength(100)
  })

  it('beforeカーソルより古いメッセージだけを返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    const cursor = { id: 'cursor-1', createdAt: new Date('2026-01-01T01:00:00.000Z') }
    const row = {
      id: 'older-1', content: 'older', messageType: 'text', parentMessageId: null,
      senderId: 'user-2', senderName: 'Sender', senderAvatarUrl: null,
      createdAt: new Date('2026-01-01T00:59:00.000Z'), updatedAt: new Date('2026-01-01T00:59:00.000Z'),
    }
    mockSelectResults([cursor], [row], [], [], [], [])

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?before=cursor-1'), ctxRouteParams())

    expect(mockLt).toHaveBeenCalled()
    expect(mockOr).toHaveBeenCalled()
    expect(res.headers.get('X-Cairn-Has-More')).toBe('false')
    await expect(res.json()).resolves.toEqual([expect.objectContaining({ id: 'older-1' })])
  })

  it('aroundでは同一時刻のメッセージもID順でアンカーの前後に分ける', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    const createdAt = new Date('2026-01-01T01:00:00.000Z')
    const message = (id: string) => ({
      id,
      content: id,
      messageType: 'text',
      parentMessageId: null,
      senderId: 'user-2',
      senderName: 'Sender',
      senderAvatarUrl: null,
      createdAt,
      updatedAt: createdAt,
    })
    mockSelectResults(
      [{ id: 'message-2', createdAt }],
      [message('message-2'), message('message-1')],
      [message('message-3')],
      [],
      [],
      [],
      [],
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?around=message-2'), ctxRouteParams())

    expect(mockOr).toHaveBeenCalled()
    expect(mockLt).toHaveBeenCalled()
    expect(mockGt).toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: 'message-1' }),
      expect.objectContaining({ id: 'message-2' }),
      expect.objectContaining({ id: 'message-3' }),
    ])
  })
  describe('引用返信の参照先', () => {
    const createdAt = new Date('2026-01-01T01:00:00.000Z')
    const replyRow = {
      id: 'reply-1', content: '返信', messageType: 'text', parentMessageId: 'quoted-1',
      senderId: 'user-2', senderName: 'Sender', senderAvatarUrl: null, createdAt, updatedAt: createdAt,
    }
    const quoted = (channelId: string) => ({
      id: 'quoted-1', content: '元の発言', senderName: 'Aki', deletedAt: null, channelId,
    })

    beforeEach(() => {
      mockRequireChannelAccess.mockResolvedValue(null)
      mockLoadFamily.mockResolvedValue([CHANNEL_ID, 'parent-channel'])
    })

    it('親チャンネルに残った発言への返信は、閲覧できるなら引用を返す', async () => {
      mockCanAccessChannel.mockResolvedValue(true)
      mockSelectResults([replyRow], [], [], [], [], [quoted('parent-channel')])

      const { GET } = await import('./route')
      const res = await GET(new Request('http://localhost/'), ctxRouteParams())

      expect(mockLoadFamily).toHaveBeenCalledWith(CHANNEL_ID)
      expect(mockCanAccessChannel).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, 'parent-channel')
      await expect(res.json()).resolves.toEqual([
        expect.objectContaining({ replyTo: expect.objectContaining({ id: 'quoted-1', content: '元の発言' }) }),
      ])
    })

    it('閲覧できない別チャンネルの発言は引用に含めない', async () => {
      mockCanAccessChannel.mockResolvedValue(false)
      mockSelectResults([replyRow], [], [], [], [], [quoted('parent-channel')])

      const { GET } = await import('./route')
      const res = await GET(new Request('http://localhost/'), ctxRouteParams())

      await expect(res.json()).resolves.toEqual([expect.objectContaining({ replyTo: null })])
    })

    it('同じチャンネルの発言は追加の権限確認なしで引用を返す', async () => {
      mockSelectResults([replyRow], [], [], [], [], [quoted(CHANNEL_ID)])

      const { GET } = await import('./route')
      const res = await GET(new Request('http://localhost/'), ctxRouteParams())

      expect(mockCanAccessChannel).not.toHaveBeenCalled()
      await expect(res.json()).resolves.toEqual([
        expect.objectContaining({ replyTo: expect.objectContaining({ id: 'quoted-1' }) }),
      ])
    })
  })
})
