// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbSelectDistinct,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbSelectDistinct: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/workspace-member-display-name', () => ({ workspaceMemberDisplayName: vi.fn(() => 'uploader') }))
vi.mock('@/lib/ai/extract-text', () => ({ isIndexable: vi.fn(() => false) }))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, selectDistinct: mockDbSelectDistinct },
  files: {
    id: 'files.id', workspaceId: 'files.workspaceId', fileName: 'files.fileName', mimeType: 'files.mimeType',
    fileSize: 'files.fileSize', fileType: 'files.fileType', uploadedBy: 'files.uploadedBy', createdAt: 'files.createdAt',
    metadata: 'files.metadata',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId', displayName: 'workspaceMembers.displayName',
  },
  messageAttachments: { fileId: 'messageAttachments.fileId', messageId: 'messageAttachments.messageId' },
  messages: {
    id: 'messages.id', channelId: 'messages.channelId', content: 'messages.content', createdAt: 'messages.createdAt', deletedAt: 'messages.deletedAt',
  },
  galleryItems: { id: 'galleryItems.id', fileId: 'galleryItems.fileId' },
  documentChunks: { sourceId: 'documentChunks.sourceId', sourceType: 'documentChunks.sourceType' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  desc: vi.fn(() => 'desc'),
  inArray: vi.fn(() => 'inArray'),
  exists: vi.fn(() => 'exists'),
  or: vi.fn(() => 'or'),
  sql: vi.fn(() => 'sql'),
}))

function queryResult(result: unknown) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

describe('/api/channels/[channelId]/files', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDbSelectDistinct.mockReturnValue(queryResult([]))
  })

  it('添付ファイルと外部リンクに共有元メッセージIDを付ける', async () => {
    const externalUrl = 'https://docs.google.com/document/d/doc-1'
    const selectResults = [
      [],
      [
        {
          id: 'file-1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: 1024,
          fileType: 'document', uploaderName: '山田 太郎', createdAt: new Date('2026-08-07T03:45:00.000Z'), metadata: {},
        },
        {
          id: 'link-1', fileName: 'Google ドキュメント', mimeType: null, fileSize: null,
          fileType: 'link', uploaderName: '山田 太郎', createdAt: new Date('2026-08-07T03:44:00.000Z'), metadata: { externalUrl },
        },
      ],
      [{ fileId: 'file-1', messageId: 'message-file' }],
      [{ id: 'message-link', content: `資料はこちらです ${externalUrl}` }],
    ]
    mockDbSelect.mockImplementation(() => queryResult(selectResults.shift() ?? []))

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ channelId: 'channel-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ id: 'file-1', sourceMessageId: 'message-file' }),
      expect.objectContaining({ id: 'link-1', sourceMessageId: 'message-link', externalUrl }),
    ])
  })
})
