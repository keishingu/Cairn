// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'

const {
  mockGetAuthContext,
  mockNot,
  mockOr,
  mockDb,
  mockRows,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockNot = vi.fn((condition: unknown) => ({ not: condition }))
  const mockOr = vi.fn((...conditions: unknown[]) => ({ or: conditions }))

  const mockRows: unknown[] = []

  function makeQuery(result: unknown[] = []) {
    return {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
  }

  const mockDb = {
    select: vi.fn((selection?: Record<string, unknown>) => makeQuery(selection?.['fileName'] ? mockRows : [])),
    selectDistinct: vi.fn(() => makeQuery()),
  }

  return { mockGetAuthContext, mockNot, mockOr, mockDb, mockRows }
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
  messages: { id: 'messages.id', channelId: 'messages.channelId' },
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
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  or: mockOr,
  exists: vi.fn((query: unknown) => ({ exists: query })),
  not: mockNot,
  isNull: vi.fn((value: unknown) => ({ isNull: value })),
  isNotNull: vi.fn((value: unknown) => ({ isNotNull: value })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ inArray: [left, right] })),
  desc: vi.fn((value: unknown) => ({ desc: value })),
  sql: vi.fn(() => 'sql'),
}))

import { GET } from './route'

const originalDmFlag = FEATURE_FLAGS.dm

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
    await GET()

    expect(mockGetAuthContext).toHaveBeenCalledWith({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })
  })

  it('DMが無効なとき、添付とmetadataのDM関連ファイルを除外する', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([])
    expect(mockNot).toHaveBeenCalledTimes(2)
  })

  it('DMが無効でも、可視な非DM関連があるファイルを許可する条件を組み合わせる', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    await GET()

    const finalGate = mockOr.mock.results.at(-1)?.value as { or?: unknown[] } | undefined
    expect(finalGate?.or).toHaveLength(2)
    expect(finalGate?.or?.[0]).toEqual(expect.objectContaining({ and: expect.any(Array) }))
    expect(finalGate?.or?.[1]).toEqual(expect.objectContaining({ or: expect.any(Array) }))
  })

  it('DMが有効なとき、DM関連ファイルの除外条件を追加しない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true

    await GET()

    expect(mockNot).not.toHaveBeenCalled()
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

    const response = await GET()

    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'file-1',
        sourceChannelId: 'channel-1',
        sourceMessageId: 'message-1',
      }),
    ])
  })
})
