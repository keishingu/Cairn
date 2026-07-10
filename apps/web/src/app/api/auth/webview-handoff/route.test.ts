// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// --- vi.hoisted: vi.mock ファクトリから参照できるよう先に定義 ---
const {
  mockGetAuthContext,
  mockGetUserById,
  mockGenerateLink,
  mockEnforceRateLimit,
  mockEnforceFixedWindowRateLimit,
  mockResetRequestRateLimitForTest,
  limitMock,
  slidingWindowMock,
  redisCtorMock,
  middlewareLimitMock,
  middlewareSlidingWindowMock,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockGetUserById = vi.fn()
  const mockGenerateLink = vi.fn()
  const mockEnforceRateLimit = vi.fn()
  const mockEnforceFixedWindowRateLimit = vi.fn()
  const mockResetRequestRateLimitForTest = vi.fn()
  const limitMock = vi.fn()
  const slidingWindowMock = vi.fn()
  const redisCtorMock = vi.fn()
  const middlewareLimitMock = vi.fn()
  const middlewareSlidingWindowMock = vi.fn()
  return {
    mockGetAuthContext,
    mockGetUserById,
    mockGenerateLink,
    mockEnforceRateLimit,
    mockEnforceFixedWindowRateLimit,
    mockResetRequestRateLimitForTest,
    limitMock,
    slidingWindowMock,
    redisCtorMock,
    middlewareLimitMock,
    middlewareSlidingWindowMock,
  }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/request-rate-limit', () => ({
  enforceFixedWindowRateLimit: mockEnforceFixedWindowRateLimit,
  resetRequestRateLimitForTest: mockResetRequestRateLimitForTest,
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mockEnforceRateLimit,
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
    static slidingWindow(...args: unknown[]) {
      const [, window] = args
      if (window === '10 m') return middlewareSlidingWindowMock(...args)
      return slidingWindowMock(...args)
    }

    prefix: string

    constructor(config: { prefix?: string }) {
      this.prefix = config.prefix ?? ''
    }

    limit(...args: unknown[]) {
      if (this.prefix === '@cairn/webview-handoff') {
        return middlewareLimitMock(...args)
      }
      return limitMock(...args)
    }
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

function makeRequest(init?: RequestInit): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/auth/webview-handoff',
    init as ConstructorParameters<typeof NextRequest>[1],
  )
}

describe('POST /api/auth/webview-handoff', () => {
  beforeEach(() => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    mockEnforceRateLimit.mockResolvedValue(null)
    mockEnforceFixedWindowRateLimit.mockResolvedValue(null)
    middlewareLimitMock.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
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
    mockResetRequestRateLimitForTest()
  })

  it('未認証なら 401 を返し、トークン発行を行わない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const { POST } = await import('./route')
    const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))

    expect(res.status).toBe(401)
    expect(mockGetUserById).not.toHaveBeenCalled()
    expect(mockGenerateLink).not.toHaveBeenCalled()
    expect(mockEnforceRateLimit).toHaveBeenCalledTimes(1)
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
    const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))

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
    const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))

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
    const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))

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
    mockEnforceFixedWindowRateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      )

    for (let i = 0; i < 5; i += 1) {
      const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))
      expect(res.status).toBe(200)
    }

    const limited = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))
    expect(limited.status).toBe(429)
    expect(mockGenerateLink).toHaveBeenCalledTimes(5)
  })

  it('pre-auth の IP 制限に引っかかったら auth lookup より先に 429 を返す', async () => {
    mockEnforceRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
    )

    const { POST } = await import('./route')
    const res = await POST(makeRequest({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' } }))

    expect(res.status).toBe(429)
    expect(mockGetAuthContext).not.toHaveBeenCalled()
  })

  it('proxy IP header が無い direct request でも user bucket 側へ進める', async () => {
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
    const res = await POST(makeRequest({ method: 'POST' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ tokenHash: 'hashed-abc' })
    expect(mockGetAuthContext).toHaveBeenCalled()
    expect(mockEnforceRateLimit).toHaveBeenCalledTimes(1)
  })
})
