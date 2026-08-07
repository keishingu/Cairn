// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const FILE_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockCanAccessFile,
  mockDownload,
  mockDeleteWhere,
  mockUpdateSet,
  mockUpdateWhere,
  mockTransaction,
  mockTransactionSelectLimit,
  mockRecordStorageUsageDelta,
  fileRow,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockCanAccessFile: vi.fn(),
  mockDownload: vi.fn(),
  mockDeleteWhere: vi.fn().mockResolvedValue(undefined),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue(undefined),
  mockTransaction: vi.fn(),
  mockTransactionSelectLimit: vi.fn(),
  mockRecordStorageUsageDelta: vi.fn().mockResolvedValue(undefined),
  fileRow: {
    id: '30000000-0000-0000-0000-000000000001',
    workspaceId: '10000000-0000-0000-0000-000000000001',
    projectId: null as string | null,
    uploadedBy: '99999999-0000-0000-0000-000000000009',
    storagePath: 'ws/ch/file.pdf',
    fileType: 'document',
    mimeType: 'application/pdf',
    fileName: 'file.pdf',
    metadata: {},
  },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ canAccessFile: mockCanAccessFile }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ download: mockDownload, remove: vi.fn() }) },
  }),
}))
vi.mock('@/lib/billing/storage-usage', () => ({ recordStorageUsageDelta: mockRecordStorageUsageDelta }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }))

// db は最初の1件取得だけ使う。チェーンの最後で [fileRow] を返す。
vi.mock('@cairn/db', () => {
  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    limit: () => Promise.resolve([fileRow]),
  }
  return {
    db: {
      select: () => selectBuilder,
      update: () => ({
        set: (values: unknown) => {
          mockUpdateSet(values)
          return { where: mockUpdateWhere }
        },
      }),
      delete: () => ({ where: mockDeleteWhere }),
      transaction: mockTransaction,
    },
    files: {},
    documentChunks: {},
  }
})
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }))

function routeParams() {
  return { params: Promise.resolve({ fileId: FILE_ID }) }
}

describe('/api/attachments/[fileId] のアクセス制御', () => {
  beforeEach(() => {
    Object.assign(fileRow, {
      storagePath: 'ws/ch/file.pdf',
      fileType: 'document',
      mimeType: 'application/pdf',
      fileName: 'file.pdf',
    })
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockCanAccessFile.mockResolvedValue(true)
    mockDownload.mockResolvedValue({
      data: 'file body',
      error: null,
    })
    mockTransaction.mockImplementation(async (callback) => callback({
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({ limit: mockTransactionSelectLimit }),
          }),
        }),
      }),
      delete: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: FILE_ID }]),
        }),
      }),
    }))
    mockTransactionSelectLimit.mockResolvedValue([{ id: FILE_ID }])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('閲覧権限が無いファイルは GET が 403 を返し、ダウンロードできない', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), routeParams())
    expect(res.status).toBe(403)
    expect(mockCanAccessFile).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID,
      DEV_USER_ID,
      expect.objectContaining({ id: FILE_ID }),
      'member',
    )
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('閲覧権限が無いファイルは PATCH が 403 を返す', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const { PATCH } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLatest: true }),
    })
    const res = await PATCH(req, routeParams())
    expect(res.status).toBe(403)
  })

  it('ファイル名を変更する', async () => {
    const { PATCH } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'renamed.pdf' }),
    })

    const res = await PATCH(req, routeParams())

    expect(res.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenCalledWith({ fileName: 'renamed.pdf' })
    await expect(res.json()).resolves.toEqual({ success: true, fileName: 'renamed.pdf' })
  })

  it('空のファイル名は拒否する', async () => {
    const { PATCH } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: '   ' }),
    })

    const res = await PATCH(req, routeParams())

    expect(res.status).toBe(400)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('閲覧権限が無いファイルは DELETE が 403 を返す', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost/', { method: 'DELETE' }), routeParams())
    expect(res.status).toBe(403)
  })

  it('同時削除で行ロック取得後にファイルが無い場合は使用量を減算しない', async () => {
    mockTransactionSelectLimit.mockResolvedValue([])

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost/', { method: 'DELETE' }), routeParams())

    expect(res.status).toBe(404)
    expect(mockRecordStorageUsageDelta).not.toHaveBeenCalled()
  })

  it('Markdownファイルは保存MIMEが汎用でもUTF-8つきtext/markdownで返す', async () => {
    Object.assign(fileRow, {
      storagePath: 'workspace-1/channel-1/file.md',
      fileName: '議事録.md',
      mimeType: 'application/octet-stream',
    })
    mockDownload.mockResolvedValue({
      data: '# 見出し',
      error: null,
    })

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/attachments/file-1'), routeParams())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await res.text()).toBe('# 見出し')
  })

  it('txtファイルは保存MIMEが汎用でもUTF-8つきtext/plainで返す', async () => {
    Object.assign(fileRow, {
      storagePath: 'workspace-1/channel-1/notes.txt',
      fileName: 'notes.txt',
      mimeType: 'application/octet-stream',
    })
    mockDownload.mockResolvedValue({
      data: 'line 1\nline 2',
      error: null,
    })

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/attachments/file-1'), routeParams())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(await res.text()).toBe('line 1\nline 2')
  })
})
