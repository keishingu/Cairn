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
  mockCreateSignedUrl,
  mockResolveUploadEntitlements,
  mockDeleteWhere,
  mockUpdateSet,
  mockUpdateWhere,
  mockTransaction,
  mockTransactionSelectLimit,
  mockRecordStorageUsageDelta,
  mockInngestSend,
  transactionDeletedFile,
  fileRow,
  mockStorageFrom,
} = vi.hoisted(() => ({
  mockStorageFrom: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockCanAccessFile: vi.fn(),
  mockDownload: vi.fn(),
  mockCreateSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null }),
  mockResolveUploadEntitlements: vi.fn(),
  mockDeleteWhere: vi.fn().mockResolvedValue(undefined),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn().mockResolvedValue(undefined),
  mockTransaction: vi.fn(),
  mockTransactionSelectLimit: vi.fn(),
  mockRecordStorageUsageDelta: vi.fn().mockResolvedValue(undefined),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
  transactionDeletedFile: {} as Record<string, unknown>,
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
    derivedStoragePath: null as string | null,
    derivedFileSize: null as number | null,
  },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ canAccessFile: mockCanAccessFile }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => {
        mockStorageFrom(bucket)
        return { download: mockDownload, remove: vi.fn(), createSignedUrl: mockCreateSignedUrl }
      },
    },
  }),
}))
vi.mock('@/lib/billing/storage-usage', () => ({ recordStorageUsageDelta: mockRecordStorageUsageDelta }))
vi.mock('@/lib/billing/entitlements', () => ({ resolveUploadEntitlements: mockResolveUploadEntitlements }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))

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
      derivedStoragePath: null,
      derivedFileSize: null,
      metadata: {},
    })
    Object.assign(transactionDeletedFile, {
      id: FILE_ID,
      workspaceId: DEV_WORKSPACE_ID,
      storagePath: fileRow.storagePath,
      derivedStoragePath: null,
      fileSize: 0,
      derivedFileSize: null,
      fileType: 'document',
      metadata: {},
    })
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockCanAccessFile.mockResolvedValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: false } })
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
          returning: () => Promise.resolve([transactionDeletedFile]),
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

  it('Solo 支援者本人でなければ新しいPDFの原本を取得できない', async () => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/file.pdf'
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), routeParams())
    expect(res.status).toBe(403)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('支援者は新しいPDFの原本を短期署名URLで取得する', async () => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/file.pdf'
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: true } })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?original=1'), routeParams())
    expect(res.status).toBe(302)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(fileRow.storagePath, 60, { download: 'file.pdf' })
  })

  it.each([
    ['pending', null, { pdfCompressionStatus: 'pending' }],
    ['failed', null, { pdfCompressionStatus: 'failed' }],
    ['missing derivative', null, { pdfCompressionStatus: 'ready' }],
  ])('最適化版が利用できない状態（%s）では原本にフォールバックしない', async (_label, derivative, metadata) => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/file.pdf'
    fileRow.derivedStoragePath = derivative
    fileRow.metadata = metadata
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), routeParams())
    expect(res.status).toBe(409)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('動画は本体を中継せず、再生中のRange要求に耐える長めの署名URLへ転送する', async () => {
    fileRow.storagePath = 'ws/ch/user/videos/clip.mov'
    fileRow.mimeType = 'video/quicktime'
    fileRow.fileName = 'clip.mov'
    fileRow.fileType = 'video'
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), routeParams())
    expect(res.status).toBe(302)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(fileRow.storagePath, 4 * 60 * 60, undefined)
    expect(mockStorageFrom).toHaveBeenCalledWith('chat-videos')
    expect(mockDownload).not.toHaveBeenCalled()
    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
  })

  it('動画の保存は支援状態を問わずダウンロード名つきの署名URLで返す', async () => {
    fileRow.storagePath = 'ws/ch/user/videos/clip.mp4'
    fileRow.mimeType = 'video/mp4'
    fileRow.fileName = '練習.mp4'
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?download=1'), routeParams())
    expect(res.status).toBe(302)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(fileRow.storagePath, 4 * 60 * 60, { download: '練習.mp4' })
  })

  it('アプリ向けに動画の署名URLをJSONで返す', async () => {
    fileRow.storagePath = 'ws/ch/user/videos/clip.mp4'
    fileRow.mimeType = 'video/mp4'
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?as=json'), routeParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://storage.test/signed', expiresIn: 4 * 60 * 60, variant: 'original' })
  })

  it('圧縮版ができた動画は、全員に圧縮版を再生・保存させる', async () => {
    Object.assign(fileRow, {
      storagePath: 'ws/ch/user/videos/clip.mov',
      derivedStoragePath: 'ws/ch/user/videos/derived/f.mp4',
      mimeType: 'video/quicktime',
      fileName: '練習.MOV',
      metadata: { videoTranscodeStatus: 'ready' },
    })
    const { GET } = await import('./route')

    const play = await GET(new Request('http://localhost/?as=json'), routeParams())
    expect(await play.json()).toMatchObject({ variant: 'derived' })
    expect(mockCreateSignedUrl).toHaveBeenLastCalledWith('ws/ch/user/videos/derived/f.mp4', 4 * 60 * 60, undefined)

    await GET(new Request('http://localhost/?download=1'), routeParams())
    expect(mockCreateSignedUrl).toHaveBeenLastCalledWith('ws/ch/user/videos/derived/f.mp4', 4 * 60 * 60, { download: '練習.mp4' })
    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
  })

  it('変換中の動画は全員が原本で再生する', async () => {
    Object.assign(fileRow, {
      storagePath: 'ws/ch/user/videos/clip.mov',
      derivedStoragePath: null,
      mimeType: 'video/quicktime',
      metadata: { videoTranscodeStatus: 'processing' },
    })
    const { GET } = await import('./route')
    await GET(new Request('http://localhost/'), routeParams())
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('ws/ch/user/videos/clip.mov', 4 * 60 * 60, undefined)
  })

  it('動画の原本のダウンロードは Solo 支援者本人だけに渡す', async () => {
    Object.assign(fileRow, {
      storagePath: 'ws/ch/user/videos/clip.mov',
      derivedStoragePath: 'ws/ch/user/videos/derived/f.mp4',
      mimeType: 'video/quicktime',
      fileName: 'clip.mov',
      metadata: { videoTranscodeStatus: 'ready' },
    })
    const { GET } = await import('./route')

    const denied = await GET(new Request('http://localhost/?original=1'), routeParams())
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ code: 'original-download-entitlement-required' })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()

    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canDownloadOriginal: true } })
    const allowed = await GET(new Request('http://localhost/?original=1'), routeParams())
    expect(allowed.status).toBe(302)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('ws/ch/user/videos/clip.mov', 4 * 60 * 60, { download: 'clip.mov' })
  })

  it('動画のサムネイルは無いため404を返す', async () => {
    fileRow.storagePath = 'ws/ch/user/videos/clip.mp4'
    fileRow.mimeType = 'video/mp4'
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?thumb=1'), routeParams())
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('最適化済みPDFは派生物を登録時のファイル名つきで返す', async () => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/file.pdf'
    fileRow.derivedStoragePath = 'ws/ch/user/pdf-derivatives/file.pdf'
    fileRow.fileName = '見積書.pdf'
    fileRow.metadata = { pdfCompressionStatus: 'ready' }
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), routeParams())
    expect(res.status).toBe(200)
    expect(mockDownload).toHaveBeenCalledWith(fileRow.derivedStoragePath)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      `inline; filename="___.pdf"; filename*=UTF-8''%E8%A6%8B%E7%A9%8D%E6%9B%B8.pdf`,
    )
  })

  it('thumb取得時に新しいPDFの原本へフォールバックしない', async () => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/file.pdf'
    fileRow.metadata = { pdfCompressionStatus: 'pending' }
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/?thumb=1'), routeParams())
    expect(res.status).toBe(404)
    expect(mockDownload).not.toHaveBeenCalled()
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
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

  it('アップロード済みファイルの拡張子変更は拒否する', async () => {
    const { PATCH } = await import('./route')
    const req = new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'renamed.txt' }),
    })

    const res = await PATCH(req, routeParams())

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'ファイルの拡張子は変更できません' })
    expect(mockUpdateSet).not.toHaveBeenCalled()
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

  it('DELETE はロック後に確定した派生物と使用量を使う', async () => {
    fileRow.storagePath = 'ws/ch/user/pdf-originals/old.pdf'
    Object.assign(transactionDeletedFile, {
      storagePath: 'ws/ch/user/pdf-originals/current.pdf',
      derivedStoragePath: 'ws/ch/user/pdf-derivatives/current.pdf',
      fileSize: 120,
      derivedFileSize: 80,
      metadata: { thumbnailPath: 'ws/ch/user/thumbnails/current.jpg' },
    })

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost/', { method: 'DELETE' }), routeParams())

    expect(res.status).toBe(200)
    expect(mockRecordStorageUsageDelta).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID,
      { originalBytes: -120, derivedBytes: -80 },
      expect.anything(),
    )
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'storage/objects.delete',
      data: {
        targets: [
          {
            bucket: 'chat-attachments',
            paths: [
              'ws/ch/user/pdf-originals/current.pdf',
              'ws/ch/user/pdf-derivatives/current.pdf',
              'ws/ch/user/thumbnails/current.jpg',
            ],
          },
        ],
      },
    })
  })

  it('動画の DELETE は動画専用バケットのオブジェクトを消す', async () => {
    Object.assign(transactionDeletedFile, {
      storagePath: 'ws/ch/user/videos/clip.mp4',
      derivedStoragePath: null,
      fileSize: 300,
      derivedFileSize: null,
      fileType: 'video',
      metadata: {},
    })

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost/', { method: 'DELETE' }), routeParams())

    expect(res.status).toBe(200)
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'storage/objects.delete',
      data: { targets: [{ bucket: 'chat-videos', paths: ['ws/ch/user/videos/clip.mp4'] }] },
    })
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

  it('Officeファイルはスマホで真っ白にならないよう attachment で返し、日本語名を filename* で渡す', async () => {
    Object.assign(fileRow, {
      storagePath: 'workspace-1/channel-1/file.xlsx',
      fileName: '見積(案).xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/attachments/file-1'), routeParams())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="__(_).xlsx"; filename*=UTF-8''%E8%A6%8B%E7%A9%8D%28%E6%A1%88%29.xlsx`,
    )
  })

  it('PDFはブラウザで表示できるため inline で返す', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/attachments/file-1'), routeParams())

    expect(res.headers.get('Content-Disposition')).toBe(
      `inline; filename="file.pdf"; filename*=UTF-8''file.pdf`,
    )
  })
})
