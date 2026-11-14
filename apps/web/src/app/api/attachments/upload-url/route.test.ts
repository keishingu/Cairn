// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockResolveUploadEntitlements,
  mockCreateSignedUploadUrl,
  mockInsertValues,
  mockDeleteWhere,
  mockHasAttachmentUploadRequestSchema,
  mockUpdateSet,
  mockStorageFrom,
} = vi.hoisted(() => ({
  mockStorageFrom: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
  mockCreateSignedUploadUrl: vi
    .fn()
    .mockResolvedValue({ data: { token: 'tok', path: 'p' }, error: null }),
  mockInsertValues: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockHasAttachmentUploadRequestSchema: vi.fn(),
  mockUpdateSet: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => {
        mockStorageFrom(bucket)
        return { createSignedUploadUrl: mockCreateSignedUploadUrl }
      },
    },
  }),
}))
vi.mock('@/lib/uploads/schema-readiness', () => ({
  hasAttachmentUploadRequestSchema: mockHasAttachmentUploadRequestSchema,
}))
vi.mock('@cairn/db', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mockInsertValues(values)
        return { returning: () => Promise.resolve([{ id: 'upload-1' }]) }
      },
    }),
    delete: () => ({ where: mockDeleteWhere }),
    update: () => ({ set: mockUpdateSet }),
  },
  uploadRequests: { id: 'upload_requests.id' },
}))

function post(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

describe('/api/attachments/upload-url', () => {
  beforeEach(() => {
    mockHasAttachmentUploadRequestSchema.mockResolvedValue(true)
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: true } })
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへはアップロードURLを発行しない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        fileSize: 5 * 1024 * 1024 + 1,
      }),
    )

    expect(res.status).toBe(403)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('50MiBを超えるファイルは拒否する', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        fileSize: 50 * 1024 * 1024 + 1,
      }),
    )

    expect(res.status).toBe(400)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('50MiBちょうどのファイルには署名付きURLを発行する', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      fileSize: 50 * 1024 * 1024,
    }))

    expect(res.status).toBe(200)
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledOnce()
  })

  it('対応していないMIMEタイプは拒否する', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'a.exe',
        mimeType: 'application/x-msdownload',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(400)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('支援がなくても50MiBちょうどの非PDFには署名付きURLを発行する', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'a.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 50 * 1024 * 1024,
      }),
    )

    expect(res.status).toBe(200)
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledOnce()
  })

  it('妥当なリクエストには署名付きURLトークンと正規化後MIMEを返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'data.csv',
        mimeType: 'application/vnd.ms-excel',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; storagePath: string; mimeType: string }
    expect(body.token).toBe('tok')
    expect(body.mimeType).toBe('text/csv')
    expect(body.storagePath.startsWith(`${DEV_WORKSPACE_ID}/${CHANNEL_ID}/${DEV_USER_ID}/`)).toBe(
      true,
    )
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: DEV_USER_ID,
        storageBucket: 'chat-attachments',
        derivedStoragePath: body.storagePath,
      }),
    )
  })

  it('拡張子が無いファイル名ではMIMEタイプから保存パスの拡張子を補完する', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: '三洋物産様向け提案資料_v0_1',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { storagePath: string; mimeType: string }
    expect(body.mimeType).toBe('application/pdf')
    expect(body.storagePath.startsWith(`${DEV_WORKSPACE_ID}/${CHANNEL_ID}/${DEV_USER_ID}/`)).toBe(
      true,
    )
    expect(body.storagePath.endsWith('.pdf')).toBe(true)
  })

  it('Solo 支援者本人には 500MiB までの動画の再開可能アップロードURLを発行する', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadVideo: true } })
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'IMG_0001.MOV',
        mimeType: 'video/quicktime',
        fileSize: 500 * 1024 * 1024,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { storagePath: string; mimeType: string; resumable: boolean; bucket: string }
    expect(body.mimeType).toBe('video/quicktime')
    expect(body.resumable).toBe(true)
    expect(body.storagePath).toContain(`/${DEV_USER_ID}/videos/`)
    // 500MiB の上限は動画専用バケットだけに置き、chat-attachments は 50MiB のまま
    expect(body.bucket).toBe('chat-videos')
    expect(mockStorageFrom).toHaveBeenCalledWith('chat-videos')
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ storageBucket: 'chat-videos' }))
    expect(mockResolveUploadEntitlements).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID)
  })

  it('支援者本人でなければ動画のアップロードURLを発行しない', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadVideo: false } })
    const { POST } = await import('./route')
    const res = await POST(
      post({ channelId: CHANNEL_ID, fileName: 'clip.mp4', mimeType: 'video/mp4', fileSize: 1024 }),
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'video-upload-entitlement-required' })
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('500MiB を超える動画は支援者でも拒否する', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadVideo: true } })
    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        fileSize: 500 * 1024 * 1024 + 1,
      }),
    )

    expect(res.status).toBe(400)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('動画以外のファイルは支援状態を問い合わせず、50MiB 上限の chat-attachments に発行する', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'a.txt', mimeType: 'text/plain', fileSize: 10 }))

    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
    expect(((await res.json()) as { bucket: string }).bucket).toBe('chat-attachments')
    expect(mockStorageFrom).toHaveBeenCalledWith('chat-attachments')
  })

  it('migration適用前は署名付きURLを発行しない', async () => {
    mockHasAttachmentUploadRequestSchema.mockResolvedValue(false)

    const { POST } = await import('./route')
    const res = await POST(
      post({
        channelId: CHANNEL_ID,
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
      }),
    )

    expect(res.status).toBe(503)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })
})
