// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '10000000-0000-0000-0000-000000000001'
const WS_ID = '20000000-0000-0000-0000-000000000001'
const FILE_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireRole,
  mockDb,
  mockRecordStorageUsageDelta,
  mockInngestSend,
  mockInsertValues,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
  mockDb: { select: vi.fn(), transaction: vi.fn() },
  mockRecordStorageUsageDelta: vi.fn().mockResolvedValue(undefined),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
  mockInsertValues: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: vi.fn().mockResolvedValue(null),
  requireRole: mockRequireRole,
}))
vi.mock('@/lib/billing/storage-usage', () => ({
  recordStorageUsageDelta: mockRecordStorageUsageDelta,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@/lib/chat/post-project-update-message', () => ({
  lockProjectUpdateChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  files: {
    id: 'files.id',
    projectId: 'files.projectId',
    storagePath: 'files.storagePath',
    derivedStoragePath: 'files.derivedStoragePath',
    fileSize: 'files.fileSize',
    derivedFileSize: 'files.derivedFileSize',
    metadata: 'files.metadata',
  },
  channels: {
    id: 'channels.id',
    projectId: 'channels.projectId',
    type: 'channels.type',
    milestoneId: 'channels.milestoneId',
  },
  messages: { id: 'messages.id', channelId: 'messages.channelId' },
  messageAttachments: {
    fileId: 'messageAttachments.fileId',
    messageId: 'messageAttachments.messageId',
  },
  galleryItems: { id: 'galleryItems.id', fileId: 'galleryItems.fileId' },
  storageDeletionJobs: {},
  uploadRequests: {
    derivedStoragePath: 'uploadRequests.derivedStoragePath',
    originalStoragePath: 'uploadRequests.originalStoragePath',
    projectId: 'uploadRequests.projectId',
    finalizedAt: 'uploadRequests.finalizedAt',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
  ne: vi.fn(() => 'ne'),
  or: vi.fn(() => 'or'),
}))

function query(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['from', 'where', 'leftJoin', 'innerJoin', 'for'])
    chain[method] = vi.fn().mockReturnValue(chain)
  chain['limit'] = vi.fn().mockResolvedValue(result)
  chain['returning'] = vi.fn().mockResolvedValue(result)
  chain['values'] = vi.fn().mockReturnValue(chain)
  return chain
}

describe('DELETE /api/projects/[id]', () => {
  afterEach(() => vi.clearAllMocks())

  it('ロック後に確定したPDF派生パスを削除キューへ含める', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user', workspaceId: WS_ID, role: 'admin' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    mockDb.select.mockReturnValue(query([{ id: PROJECT_ID }]))

    const initialFile = {
      id: FILE_ID,
      projectId: PROJECT_ID,
      storagePath: 'original.pdf',
      derivedStoragePath: null,
      fileSize: 100,
      derivedFileSize: null,
      metadata: { pdfCompressionStatus: 'processing' },
      galleryItemId: null,
    }
    const currentFile = {
      id: FILE_ID,
      storagePath: 'ws/ch/user/pdf-originals/file.pdf',
      derivedStoragePath: 'ws/ch/user/pdf-derivatives/file.pdf',
      fileSize: 100,
      derivedFileSize: 40,
      metadata: { pdfCompressionStatus: 'ready' },
    }
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(query([{ id: PROJECT_ID }])) // project lock
        .mockReturnValueOnce(query([currentFile])) // files row lock with latest values
        .mockReturnValueOnce(query([])), // pending uploads
      selectDistinct: vi
        .fn()
        .mockReturnValueOnce(query([initialFile]))
        .mockReturnValueOnce(query([])),
      insert: vi.fn().mockReturnValue({
        values: (values: unknown) => {
          mockInsertValues(values)
          return { returning: async () => [{ id: 'job-id' }] }
        },
      }),
      delete: vi
        .fn()
        .mockReturnValueOnce({
          where: () => ({ returning: async () => [{ fileSize: 100, derivedFileSize: 40 }] }),
        })
        .mockReturnValueOnce({ where: () => ({ returning: async () => [{ id: PROJECT_ID }] }) }),
      update: vi.fn().mockReturnValue({ set: () => ({ where: async () => undefined }) }),
    }
    mockDb.transaction.mockImplementation(async (callback) => callback(tx))

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(res.status).toBe(200)
    expect(mockRecordStorageUsageDelta).toHaveBeenCalledWith(
      WS_ID,
      { originalBytes: -100, derivedBytes: -40 },
      tx,
    )
    expect(mockInsertValues).toHaveBeenCalledWith({
      targets: [
        {
          bucket: 'chat-attachments',
          paths: ['ws/ch/user/pdf-originals/file.pdf', 'ws/ch/user/pdf-derivatives/file.pdf'],
        },
      ],
    })
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'storage/deletion.requested',
      data: { jobId: 'job-id' },
    })
  })
})
