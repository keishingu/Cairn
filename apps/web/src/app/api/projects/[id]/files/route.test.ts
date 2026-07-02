// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockRequireProjectAccess, mockCanAccessFile } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
  mockRequireProjectAccess: vi.fn(),
  mockCanAccessFile: vi.fn(),
}))

const getAuthContext = vi.fn()

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  canAccessFile: mockCanAccessFile,
}))

vi.mock('@/lib/ai/extract-text', () => ({
  isIndexable: vi.fn(() => false),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  files: {
    id: 'files.id',
    fileName: 'files.fileName',
    mimeType: 'files.mimeType',
    fileSize: 'files.fileSize',
    fileType: 'files.fileType',
    createdAt: 'files.createdAt',
    metadata: 'files.metadata',
    workspaceId: 'files.workspaceId',
    projectId: 'files.projectId',
    uploadedBy: 'files.uploadedBy',
  },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  galleryItems: { id: 'galleryItems.id', fileId: 'galleryItems.fileId' },
  documentChunks: { sourceId: 'documentChunks.sourceId', sourceType: 'documentChunks.sourceType' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}))

function chain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  }
}

describe('GET /api/projects/[id]/files', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReset()
    mockDb.selectDistinct.mockReset()
    mockRequireProjectAccess.mockReset()
    mockCanAccessFile.mockReset()
    vi.resetModules()
  })

  it('pending project upload を一覧から除外する', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)

    const rows = [
      {
        id: 'file-hidden',
        fileName: 'hidden.txt',
        mimeType: 'text/plain',
        fileSize: 10,
        fileType: 'file',
        uploaderName: 'User One',
        createdAt: new Date('2026-07-02T12:00:00Z'),
        metadata: { pendingChannelId: 'channel-1' },
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'user-2',
      },
      {
        id: 'file-visible',
        fileName: 'visible.txt',
        mimeType: 'text/plain',
        fileSize: 20,
        fileType: 'file',
        uploaderName: 'User Two',
        createdAt: new Date('2026-07-02T12:01:00Z'),
        metadata: {},
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'user-2',
      },
    ]

    mockDb.select
      .mockReturnValueOnce(chain([{ id: 'project-1' }]))
      .mockReturnValueOnce(chain(rows))
    mockDb.selectDistinct.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })
    mockCanAccessFile.mockImplementation(async (_workspaceId: string, _userId: string, file: { id: string }) => file.id === 'file-visible')

    const { GET } = await import('./route')
    const res = await GET({} as Request, { params: Promise.resolve({ id: 'project-1' }) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'file-visible',
        fileName: 'visible.txt',
      }),
    ])
    expect(mockCanAccessFile).toHaveBeenCalledTimes(2)
  })

  it('canAccessFile の fan-out を 50 件単位に抑える', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: 'ws-1', userId: 'user-1' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)

    const rows = Array.from({ length: 120 }, (_, index) => ({
      id: `file-${index}`,
      fileName: `file-${index}.txt`,
      mimeType: 'text/plain',
      fileSize: 10,
      fileType: 'file',
      uploaderName: 'User One',
      createdAt: new Date(`2026-07-02T12:${String(index % 60).padStart(2, '0')}:00Z`),
      metadata: {},
      workspaceId: 'ws-1',
      projectId: 'project-1',
      uploadedBy: 'user-2',
    }))

    mockDb.select
      .mockReturnValueOnce(chain([{ id: 'project-1' }]))
      .mockReturnValueOnce(chain(rows))
    mockDb.selectDistinct.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })

    let inFlight = 0
    let maxInFlight = 0
    mockCanAccessFile.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return true
    })

    const { GET } = await import('./route')
    const res = await GET({} as Request, { params: Promise.resolve({ id: 'project-1' }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toHaveLength(120)
    expect(mockCanAccessFile).toHaveBeenCalledTimes(120)
    expect(maxInFlight).toBeLessThanOrEqual(50)
  })
})
