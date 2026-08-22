// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExpiredRequests, mockRemove, mockDeleteWhere } = vi.hoisted(() => ({
  mockExpiredRequests: vi.fn(),
  mockRemove: vi.fn(),
  mockDeleteWhere: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockExpiredRequests }),
      }),
    }),
    delete: () => ({ where: mockDeleteWhere }),
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({ limit: mockExpiredRequests }),
            }),
          }),
        }),
        delete: () => ({ where: mockDeleteWhere }),
      }),
  },
  uploadRequests: {
    id: 'upload_requests.id',
    derivedStoragePath: 'upload_requests.derived_storage_path',
    storageBucket: 'upload_requests.storage_bucket',
    originalStoragePath: 'upload_requests.original_storage_path',
    finalizedAt: 'upload_requests.finalized_at',
    expiresAt: 'upload_requests.expires_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  isNull: vi.fn(() => 'isNull'),
  lte: vi.fn(() => 'lte'),
  sql: vi.fn(() => 'sql'),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ remove: mockRemove }) },
  }),
}))

describe('cleanupExpiredUploadRequests', () => {
  beforeEach(() => {
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('期限切れの未確定アップロードの派生版とオリジナルを削除する', async () => {
    mockExpiredRequests.mockResolvedValue([
      {
        id: 'upload-1',
        derivedStoragePath: 'workspace/project/derived/image.jpg',
        storageBucket: 'gallery',
        originalStoragePath: 'workspace/project/original/image.jpg',
      },
    ])
    mockRemove.mockResolvedValue({ error: null })

    const { cleanupExpiredUploadRequests } = await import('./cleanup')
    await expect(cleanupExpiredUploadRequests()).resolves.toEqual({ removed: 1, failed: 0 })

    expect(mockRemove).toHaveBeenCalledWith(['workspace/project/derived/image.jpg'])
    expect(mockRemove).toHaveBeenCalledWith(['workspace/project/original/image.jpg'])
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it('ストレージ削除に失敗した行は次回の回収のために残す', async () => {
    mockExpiredRequests.mockResolvedValue([
      {
        id: 'upload-1',
        derivedStoragePath: 'workspace/project/derived/image.jpg',
        storageBucket: 'gallery',
        originalStoragePath: null,
      },
    ])
    mockRemove.mockResolvedValue({ error: new Error('storage unavailable') })

    const { cleanupExpiredUploadRequests } = await import('./cleanup')
    await expect(cleanupExpiredUploadRequests()).resolves.toEqual({ removed: 0, failed: 1 })

    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('ロック待ち中に確定されたintentは削除しない', async () => {
    mockExpiredRequests.mockResolvedValueOnce([{ id: 'upload-1' }]).mockResolvedValueOnce([])

    const { cleanupExpiredUploadRequests } = await import('./cleanup')
    await expect(cleanupExpiredUploadRequests()).resolves.toEqual({ removed: 0, failed: 0 })

    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })
})
