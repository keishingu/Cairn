// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockCanAccessFile, mockGetWorkspaceMemberRole } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
  mockCanAccessFile: vi.fn(),
  mockGetWorkspaceMemberRole: vi.fn(),
}))

const getAuthContext = vi.fn()

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  canAccessFile: mockCanAccessFile,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
}))

vi.mock('@/lib/ai/extract-text', () => ({
  isIndexable: vi.fn(() => false),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  files: { id: 'files.id', projectId: 'files.projectId', workspaceId: 'files.workspaceId', uploadedBy: 'files.uploadedBy', metadata: 'files.metadata', fileName: 'files.fileName', mimeType: 'files.mimeType', fileSize: 'files.fileSize', fileType: 'files.fileType', createdAt: 'files.createdAt' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  projects: { id: 'projects.id', title: 'projects.title' },
  projectMembers: { projectId: 'projectMembers.projectId', userId: 'projectMembers.userId' },
  messageAttachments: { fileId: 'messageAttachments.fileId', messageId: 'messageAttachments.messageId' },
  messages: { id: 'messages.id', channelId: 'messages.channelId' },
  channels: { id: 'channels.id', projectId: 'channels.projectId', isPrivate: 'channels.isPrivate', type: 'channels.type', workspaceId: 'channels.workspaceId' },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  galleryItems: { id: 'galleryItems.id', fileId: 'galleryItems.fileId' },
  documentChunks: { sourceId: 'documentChunks.sourceId', sourceType: 'documentChunks.sourceType' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId', avatarUrl: 'workspaceMembers.avatarUrl' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  isNotNull: vi.fn((...args: unknown[]) => ({ type: 'isNotNull', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: vi.fn(() => 'sql'),
  exists: vi.fn((...args: unknown[]) => ({ type: 'exists', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  ne: vi.fn((...args: unknown[]) => ({ type: 'ne', args })),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  }
}

describe('GET /api/files', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('canAccessFile で不可な自己アップロード行をレスポンスから除外する', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
    const rows = [
      {
        id: 'file-hidden',
        projectId: null,
        projectTitle: null,
        workspaceId: 'ws-1',
        channelName: null,
        fileName: 'hidden.txt',
        mimeType: 'text/plain',
        fileSize: 10,
        fileType: 'file',
        metadata: {},
        uploadedBy: 'user-1',
        uploaderName: 'User One',
        uploaderAvatarUrl: null,
        createdAt: new Date('2026-07-02T12:00:00Z'),
      },
      {
        id: 'file-visible',
        projectId: 'project-1',
        projectTitle: 'Project',
        workspaceId: 'ws-1',
        channelName: 'general',
        fileName: 'visible.txt',
        mimeType: 'text/plain',
        fileSize: 20,
        fileType: 'file',
        metadata: {},
        uploadedBy: 'user-2',
        uploaderName: 'User Two',
        uploaderAvatarUrl: null,
        createdAt: new Date('2026-07-02T12:01:00Z'),
      },
    ]
    mockDb.select.mockImplementation(() => selectChain(rows))
    mockDb.selectDistinct.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })
    mockCanAccessFile.mockImplementation(async (_workspaceId: string, _userId: string, file: { id: string }) => file.id === 'file-visible')

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'file-visible',
        fileName: 'visible.txt',
      }),
    ])
    expect(mockCanAccessFile).toHaveBeenCalledTimes(2)
  })
})
