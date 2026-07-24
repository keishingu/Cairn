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
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockResolveUploadEntitlements: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: 'tok', path: 'p' }, error: null }),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/billing/entitlements', () => ({ resolveUploadEntitlements: mockResolveUploadEntitlements }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ createSignedUploadUrl: mockCreateSignedUploadUrl }) },
  }),
}))

function post(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

describe('/api/attachments/upload-url', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: true } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへはアップロードURLを発行しない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 100 }))

    expect(res.status).toBe(403)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('10MBを超えるファイルは拒否する', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: 11 * 1024 * 1024 }))

    expect(res.status).toBe(400)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('対応していないMIMEタイプは拒否する', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'a.exe', mimeType: 'application/x-msdownload', fileSize: 100 }))

    expect(res.status).toBe(400)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('原本保存の権利が無い場合は署名付きURLを発行しない', async () => {
    mockResolveUploadEntitlements.mockResolvedValue({ rights: { canUploadOriginal: false } })

    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 100 }))

    expect(res.status).toBe(403)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('妥当なリクエストには署名付きURLトークンと正規化後MIMEを返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'data.csv', mimeType: 'application/vnd.ms-excel', fileSize: 100 }))

    expect(res.status).toBe(200)
    const body = await res.json() as { token: string; storagePath: string; mimeType: string }
    expect(body.token).toBe('tok')
    expect(body.mimeType).toBe('text/csv')
    expect(body.storagePath.startsWith(`${DEV_WORKSPACE_ID}/${CHANNEL_ID}/`)).toBe(true)
  })

  it('拡張子が無いファイル名ではMIMEタイプから保存パスの拡張子を補完する', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({
      channelId: CHANNEL_ID,
      fileName: '三洋物産様向け提案資料_v0_1',
      mimeType: 'application/pdf',
      fileSize: 100,
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { storagePath: string; mimeType: string }
    expect(body.mimeType).toBe('application/pdf')
    expect(body.storagePath.startsWith(`${DEV_WORKSPACE_ID}/${CHANNEL_ID}/`)).toBe(true)
    expect(body.storagePath.endsWith('.pdf')).toBe(true)
  })
})
