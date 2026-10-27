// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (args: {
  event: { data: { fileId: string; workspaceId: string } }
  step: { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> }
}) => Promise<unknown>

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  const state = {
    file: undefined as Record<string, unknown> | undefined,
    transactionFile: undefined as Record<string, unknown> | undefined,
    updates: [] as Record<string, unknown>[],
    usageDeltas: [] as Record<string, unknown>[],
    deletionTargets: [] as Record<string, unknown>[],
    downloads: vi.fn(),
    uploads: vi.fn(),
    removes: vi.fn(),
    compress: vi.fn(),
  }

  const makeQuery = (read: () => unknown) => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const value = read()
          return value === undefined ? [] : [value]
        },
        for: () => ({
          limit: async () => {
            const value = read()
            return value === undefined ? [] : [value]
          },
        }),
      }),
    }),
  })

  const update = {
    set: (value: Record<string, unknown>) => {
      state.updates.push(value)
      return { where: async () => undefined }
    },
  }

  const tx: {
    select: () => ReturnType<typeof makeQuery>
    update: () => typeof update
  } = {
    select: () => makeQuery(() => state.transactionFile),
    update: () => update,
  }

  return {
    handlers,
    state,
    db: {
      select: () => makeQuery(() => state.file),
      update: () => update,
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          state.deletionTargets.push(value)
          return { returning: async () => [{ id: 'storage-job-id' }] }
        },
      }),
      transaction: async (
        callback: (transactionClient: {
          select: () => ReturnType<typeof makeQuery>
          update: () => typeof update
        }) => Promise<unknown>,
      ) => callback(tx),
    },
  }
})

vi.mock('./client', () => ({
  inngest: {
    createFunction: (options: { id: string }, _trigger: unknown, handler: Handler) => {
      mocks.handlers.set(options.id, handler)
      return { options }
    },
    send: vi.fn(),
  },
}))

vi.mock('@cairn/db', () => ({ db: mocks.db, files: { id: 'id', workspaceId: 'workspaceId' }, storageDeletionJobs: { id: 'storage-deletion-job-id' } }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        download: mocks.state.downloads,
        upload: mocks.state.uploads,
        remove: mocks.state.removes,
      }),
    },
  }),
}))
vi.mock('@/lib/pdf/compress-images', () => ({ compressPdfImages: mocks.state.compress }))
vi.mock('@/lib/billing/storage-usage', () => ({
  recordStorageUsageDelta: vi.fn(async (_workspaceId: string, delta: Record<string, unknown>) => {
    mocks.state.usageDeltas.push(delta)
  }),
}))

import './functions'

const originalBytes = Buffer.from('original pdf bytes')
const smallerBytes = Buffer.from('smaller pdf')

function pdfFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-id',
    workspaceId: 'workspace-id',
    storagePath: 'workspace-id/channel-id/file-id.pdf',
    uploadedBy: 'user-id',
    mimeType: 'application/pdf',
    metadata: {},
    derivedFileSize: null,
    ...overrides,
  }
}

function invoke() {
  const handler = mocks.handlers.get('compress-uploaded-pdf')
  expect(handler).toBeDefined()
  return handler!({
    event: { data: { fileId: 'file-id', workspaceId: 'workspace-id' } },
    step: { run: (_name, callback) => callback() },
  })
}

describe('compressUploadedPdf', () => {
  beforeEach(() => {
    mocks.state.file = pdfFile()
    mocks.state.transactionFile = { derivedFileSize: null, metadata: {} }
    mocks.state.updates.length = 0
    mocks.state.usageDeltas.length = 0
    mocks.state.deletionTargets.length = 0
    mocks.state.downloads.mockReset().mockResolvedValue({
      data: { arrayBuffer: async () => originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength) },
      error: null,
    })
    mocks.state.uploads.mockReset().mockResolvedValue({ error: null })
    mocks.state.removes.mockReset().mockResolvedValue({ error: null })
    mocks.state.compress.mockReset().mockResolvedValue(smallerBytes)
  })

  it('元PDFを残し、圧縮版を派生保存して容量差分を記録する', async () => {
    await expect(invoke()).resolves.toEqual({
      compressed: true,
      originalSize: originalBytes.byteLength,
      newSize: smallerBytes.byteLength,
    })

    expect(mocks.state.downloads).toHaveBeenCalledWith('workspace-id/channel-id/file-id.pdf')
    expect(mocks.state.uploads).toHaveBeenCalledWith(
      'workspace-id/channel-id/user-id/pdf-derivatives/file-id.pdf',
      smallerBytes,
      { contentType: 'application/pdf', upsert: true },
    )
    expect(mocks.state.usageDeltas).toEqual([{
      originalBytes: 0,
      derivedBytes: smallerBytes.byteLength,
    }])
    expect(mocks.state.updates.every((update) => !('storagePath' in update) && !('fileSize' in update))).toBe(true)
    expect(mocks.state.updates).toContainEqual(expect.objectContaining({
      derivedStoragePath: 'workspace-id/channel-id/user-id/pdf-derivatives/file-id.pdf',
      derivedFileSize: smallerBytes.byteLength,
      derivedMimeType: 'application/pdf',
      metadata: { pdfCompressionStatus: 'ready', pdfCompressionUnchanged: false },
    }))
  })

  it('処理済みのPDFは再圧縮せずに終了する', async () => {
    mocks.state.file = pdfFile({ metadata: { pdfCompressionStatus: 'ready' } })

    await expect(invoke()).resolves.toEqual({ skipped: true, reason: 'already ready' })

    expect(mocks.state.downloads).not.toHaveBeenCalled()
    expect(mocks.state.compress).not.toHaveBeenCalled()
  })

  it('既存の派生PDFがある再試行では容量の増減分だけを記録する', async () => {
    const previousDerivedSize = 4
    mocks.state.transactionFile = { derivedFileSize: previousDerivedSize, metadata: {} }

    await expect(invoke()).resolves.toEqual({
      compressed: true,
      originalSize: originalBytes.byteLength,
      newSize: smallerBytes.byteLength,
    })

    expect(mocks.state.usageDeltas).toEqual([{
      originalBytes: 0,
      derivedBytes: smallerBytes.byteLength - previousDerivedSize,
    }])
  })

  it('圧縮中に元ファイルが削除された場合は派生ファイルを削除する', async () => {
    mocks.state.transactionFile = undefined

    await expect(invoke()).resolves.toEqual({ skipped: true, reason: 'file deleted during compression' })

    expect(mocks.state.removes).toHaveBeenCalledWith([
      'workspace-id/channel-id/user-id/pdf-derivatives/file-id.pdf',
    ])
    expect(mocks.state.usageDeltas).toEqual([])
  })

  it('元ファイル削除後に派生ファイルの削除が失敗したらoutboxへ登録する', async () => {
    mocks.state.transactionFile = undefined
    mocks.state.removes.mockResolvedValue({ error: new Error('remove failed') })

    await expect(invoke()).resolves.toEqual({ skipped: true, reason: 'file deleted during compression' })
    expect(mocks.state.deletionTargets).toEqual([{
      targets: [{
        bucket: 'chat-attachments',
        paths: ['workspace-id/channel-id/user-id/pdf-derivatives/file-id.pdf'],
      }],
    }])
  })
})
