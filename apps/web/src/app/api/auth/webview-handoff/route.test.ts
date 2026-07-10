// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { resetRequestRateLimitForTest } from '@/lib/request-rate-limit'

// --- vi.hoisted: vi.mock ファクトリから参照できるよう先に定義 ---
const {
  mockGetAuthContext,
  mockGetUserById,
  mockGenerateLink,
  limitMock,
  slidingWindowMock,
  redisCtorMock,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockGetUserById = vi.fn()
  const mockGenerateLink = vi.fn()
  const limitMock = vi.fn()
  const slidingWindowMock = vi.fn()
  const redisCtorMock = vi.fn()
  return { mockGetAuthContext, mockGetUserById, mockGenerateLink, limitMock, slidingWindowMock, redisCtorMock }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        generateLink: mockGenerateLink,
      },
    },
  })),
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

function authed() {
  mockGetAuthContext.mockResolvedValue({
    ctx: { userId: 'user-1', workspaceId: 'ws-1' },
    error: null,
  })
}

describe('POST /api/auth/webview-handoff', () => {
  beforeEach(() => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    limitMock.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
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

  it('未認証なら 401 を返し、トークン発行を行わない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(401)
    expect(mockGetUserById).not.toHaveBeenCalled()
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('認証済みユーザーの email で magiclink を発行し tokenHash を返す', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'me@example.com' } },
      error: null,
    })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-abc' } },
      error: null,
    })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ tokenHash: 'hashed-abc' })
    // email はリクエストではなく認証済みユーザーから解決すること
    expect(mockGetUserById).toHaveBeenCalledWith('user-1')
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'me@example.com' })
  })

  it('ユーザーの email が取得できない場合は 500 を返し、リンク発行を行わない', async () => {
    authed()
    mockGetUserById.mockResolvedValue({ data: { user: { id: 'user-1', email: null } }, error: null })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(500)
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('magiclink 発行に失敗した場合は 500 を返す', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'me@example.com' } },
      error: null,
    })
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(500)
  })

  it('短時間の連続発行は 429 で制限する', async () => {
    authed()
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'me@example.com' } },
      error: null,
    })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-abc' } },
      error: null,
    })

    const { POST } = await import('./route')
    limitMock
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000, pending: Promise.resolve() })
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 3, reset: Date.now() + 60_000, pending: Promise.resolve() })
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 2, reset: Date.now() + 60_000, pending: Promise.resolve() })
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 1, reset: Date.now() + 60_000, pending: Promise.resolve() })
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 0, reset: Date.now() + 60_000, pending: Promise.resolve() })
      .mockResolvedValueOnce({ success: false, limit: 5, remaining: 0, reset: Date.now() + 60_000, pending: Promise.resolve() })

    for (let i = 0; i < 5; i += 1) {
      const res = await POST()
      expect(res.status).toBe(200)
    }

    const limited = await POST()
    expect(limited.status).toBe(429)
    expect(mockGenerateLink).toHaveBeenCalledTimes(5)
  })
})
