// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'

const {
  mockGetAuthContext,
  mockAnd,
  mockNot,
  mockOr,
  mockDb,
  mockRows,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockAnd = vi.fn((...conditions: unknown[]) => ({ and: conditions }))
  const mockNot = vi.fn((condition: unknown) => ({ not: condition }))
  const mockOr = vi.fn((...conditions: unknown[]) => ({ or: conditions }))

  const mockRows: unknown[] = []

  function makeQuery(result: unknown[] = []) {
    return {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
  }

  const mockDb = {
    select: vi.fn((selection?: Record<string, unknown>) => makeQuery(selection?.['fileName'] ? mockRows : [])),
    selectDistinct: vi.fn(() => makeQuery()),
  }

  return { mockGetAuthContext, mockAnd, mockNot, mockOr, mockDb, mockRows }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/ai/extract-text', () => ({
  isIndexable: vi.fn(() => false),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  files: {
    id: 'files.id', projectId: 'files.projectId', workspaceId: 'files.workspaceId',
    uploadedBy: 'files.uploadedBy', metadata: 'files.metadata', fileName: 'files.fileName',
    mimeType: 'files.mimeType', fileSize: 'files.fileSize', fileType: 'files.fileType',
    createdAt: 'files.createdAt',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  projects: { id: 'projects.id', title: 'projects.title' },
  projectMembers: { projectId: 'projectMembers.projectId', userId: 'projectMembers.userId' },
  messageAttachments: { messageId: 'messageAttachments.messageId', fileId: 'messageAttachments.fileId' },
  messages: { id: 'messages.id', channelId: 'messages.channelId', deletedAt: 'messages.deletedAt' },
  channels: {
    id: 'channels.id', projectId: 'channels.projectId', workspaceId: 'channels.workspaceId',
    isPrivate: 'channels.isPrivate', type: 'channels.type', name: 'channels.name',
  },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  galleryItems: { id: 'galleryItems.id', fileId: 'galleryItems.fileId' },
  documentChunks: { sourceId: 'documentChunks.sourceId', sourceType: 'documentChunks.sourceType' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName', avatarUrl: 'workspaceMembers.avatarUrl',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  ne: vi.fn((left: unknown, right: unknown) => ({ ne: [left, right] })),
  and: mockAnd,
  or: mockOr,
  exists: vi.fn((query: unknown) => ({ exists: query })),
  not: mockNot,
  isNull: vi.fn((value: unknown) => ({ isNull: value })),
  isNotNull: vi.fn((value: unknown) => ({ isNotNull: value })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ inArray: [left, right] })),
  desc: vi.fn((value: unknown) => ({ desc: value })),
  gte: vi.fn((left: unknown, right: unknown) => ({ gte: [left, right] })),
  lt: vi.fn((left: unknown, right: unknown) => ({ lt: [left, right] })),
  like: vi.fn((left: unknown, right: unknown) => ({ like: [left, right] })),
  ilike: vi.fn((left: unknown, right: unknown) => ({ ilike: [left, right] })),
  sql: vi.fn(() => 'sql'),
}))

import { GET } from './route'

const originalDmFlag = FEATURE_FLAGS.dm

function listRequest(query = '') {
  return new Request(`http://localhost/api/files${query}`)
}

function fileRow(id: string, createdAt: string) {
  return {
    id,
    chatSource: null,
    metadataChannelId: null,
    projectId: null,
    projectTitle: null,
    fileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileType: 'document',
    metadata: {},
    uploaderName: '山田 太郎',
    uploaderAvatarUrl: null,
    createdAt: new Date(createdAt),
    cursorCreatedAt: createdAt.replace('Z', '000Z'),
  }
}

describe('GET /api/files', () => {
  beforeEach(() => {
    mockRows.length = 0
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
  })

  afterEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = originalDmFlag
    vi.clearAllMocks()
  })

  it('MCP内部の読み取りPATを許可する認証設定を使用する', async () => {
    await GET(listRequest())

    expect(mockGetAuthContext).toHaveBeenCalledWith({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
  })

  it('DMが無効なとき、添付とmetadataのDM関連ファイルを除外する', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    const response = await GET(listRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null })
    // ギャラリー除外の1回 + DM 由来（添付・metadata）の除外2回
    expect(mockNot).toHaveBeenCalledTimes(3)
  })

  it('DMが無効でも、可視な非DM関連があるファイルを許可する条件を組み合わせる', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    await GET(listRequest())

    const finalGate = mockOr.mock.results.at(-1)?.value as { or?: unknown[] } | undefined
    expect(finalGate?.or).toHaveLength(2)
    expect(finalGate?.or?.[0]).toEqual(expect.objectContaining({ and: expect.any(Array) }))
    expect(finalGate?.or?.[1]).toEqual(expect.objectContaining({ or: expect.any(Array) }))
  })

  it('DMが有効なとき、DM関連ファイルの除外条件を追加しない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true

    await GET(listRequest())

    // ギャラリー除外の1回だけ
    expect(mockNot).toHaveBeenCalledTimes(1)
  })

  it('ゲストも公開ワークスペースチャンネルの共有元へ移動できる条件を含める', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'guest-1', workspaceId: 'workspace-1', role: 'guest' },
      error: null,
    })

    await GET(listRequest())

    expect(mockAnd).toHaveBeenCalledWith(
      { eq: ['channels.type', 'workspace'] },
      { eq: ['channels.isPrivate', false] },
      { eq: ['channels.workspaceId', 'workspace-1'] },
    )
  })

  it('ゲストのプライベートプロジェクトチャンネルは両方の参加を要求する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'guest-1', workspaceId: 'workspace-1', role: 'guest' },
      error: null,
    })

    await GET(listRequest())

    expect(mockAnd).toHaveBeenCalledWith(
      { exists: expect.anything() },
      {
        or: [
          { ne: ['channels.type', 'project'] },
          { exists: expect.anything() },
        ],
      },
    )
  })

  it('共有元のチャンネルとメッセージIDを返す', async () => {
    mockRows.push({
      id: 'file-1',
      chatSource: { channelId: 'channel-1', messageId: 'message-1', channelName: '全体' },
      metadataChannelId: null,
      projectId: null,
      projectTitle: null,
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileType: 'document',
      metadata: {},
      uploaderName: '山田 太郎',
      uploaderAvatarUrl: null,
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    })

    const response = await GET(listRequest())

    await expect(response.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'file-1',
          sourceChannelId: 'channel-1',
          sourceMessageId: 'message-1',
        }),
      ],
      nextCursor: null,
    })
  })

  it('limit より多く取れたとき、最後の行を指す nextCursor を返し limit 件だけ返す', async () => {
    mockRows.push(
      fileRow('00000000-0000-4000-8000-000000000003', '2026-08-08T00:00:03.000Z'),
      fileRow('00000000-0000-4000-8000-000000000002', '2026-08-08T00:00:02.000Z'),
      fileRow('00000000-0000-4000-8000-000000000001', '2026-08-08T00:00:01.000Z'),
    )

    const response = await GET(listRequest('?limit=2'))
    const body = await response.json() as { items: { id: string }[]; nextCursor: string | null }

    expect(body.items.map(item => item.id)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
    ])
    expect(body.nextCursor).not.toBeNull()
    expect(JSON.parse(Buffer.from(body.nextCursor!, 'base64url').toString('utf8'))).toEqual({
      createdAt: '2026-08-08T00:00:02.000000Z',
      id: '00000000-0000-4000-8000-000000000002',
    })
  })

  it('不正なカーソルは 400 を返す', async () => {
    const response = await GET(listRequest('?cursor=broken'))

    expect(response.status).toBe(400)
  })

  it('検索語はファイル名・プロジェクト名・チャンネル名のいずれかに部分一致させ、ワイルドカードをエスケープする', async () => {
    const { ilike } = await import('drizzle-orm')

    await GET(listRequest('?q=50%25_off'))

    expect(ilike).toHaveBeenCalledWith('files.fileName', '%50\\%\\_off%')
    expect(ilike).toHaveBeenCalledWith('projects.title', '%50\\%\\_off%')
    expect(ilike).toHaveBeenCalledWith('channels.name', '%50\\%\\_off%')
  })
})
