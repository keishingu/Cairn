// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRequestRateLimitForTest } from '@/lib/request-rate-limit'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireChannelAccess, mockCreateSignedUploadUrl, limitMock, slidingWindowMock, redisCtorMock } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: 'tok', path: 'p' }, error: null }),
  limitMock: vi.fn(),
  slidingWindowMock: vi.fn(),
  redisCtorMock: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ createSignedUploadUrl: mockCreateSignedUploadUrl }) },
  }),
}))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindowMock

    constructor() {}

    limit = limitMock
  },
}))
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) {
      redisCtorMock(config)
    }
  },
}))

function post(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

describe('/api/attachments/upload-url', () => {
  beforeEach(() => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    limitMock.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
  })

  afterEach(() => {
    delete process.env['UPSTASH_REDIS_REST_URL']
    delete process.env['UPSTASH_REDIS_REST_TOKEN']
    vi.clearAllMocks()
    resetRequestRateLimitForTest()
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

  it('同じチャンネルへの短時間の連続発行は 429 で制限する', async () => {
    const { POST } = await import('./route')
    for (let i = 0; i < 20; i += 1) {
      limitMock.mockResolvedValueOnce({
        success: true,
        limit: 20,
        remaining: 19 - i,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      })
    }
    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    for (let i = 0; i < 20; i += 1) {
      const res = await POST(post({ channelId: CHANNEL_ID, fileName: 'data.csv', mimeType: 'text/csv', fileSize: 100 }))
      expect(res.status).toBe(200)
    }

    const limited = await POST(post({ channelId: CHANNEL_ID, fileName: 'data.csv', mimeType: 'text/csv', fileSize: 100 }))
    expect(limited.status).toBe(429)
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledTimes(20)
  })
})
