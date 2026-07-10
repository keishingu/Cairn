// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { resetRequestRateLimitForTest } from '@/lib/request-rate-limit'

const { mockGetAuthContext, mockBuildOAuthUrl, limitMock, slidingWindowMock, redisCtorMock } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockBuildOAuthUrl: vi.fn(),
  limitMock: vi.fn(),
  slidingWindowMock: vi.fn(),
  redisCtorMock: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/google-calendar-api', () => ({
  buildOAuthUrl: mockBuildOAuthUrl,
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

describe('GET /api/calendar/google/connect', () => {
  beforeEach(() => {
    process.env['GOOGLE_CALENDAR_CLIENT_ID'] = 'client-id'
    process.env['GOOGLE_CALENDAR_REDIRECT_URI'] = 'http://localhost/callback'
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    mockBuildOAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth')
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
  })

  afterEach(() => {
    delete process.env['GOOGLE_CALENDAR_CLIENT_ID']
    delete process.env['GOOGLE_CALENDAR_REDIRECT_URI']
    delete process.env['UPSTASH_REDIS_REST_URL']
    delete process.env['UPSTASH_REDIS_REST_TOKEN']
    vi.clearAllMocks()
    resetRequestRateLimitForTest()
  })

  it('未認証なら 401 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('OAuth URL を返して state cookie を設定する', async () => {
    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ url: 'https://accounts.google.com/o/oauth2/v2/auth' })
    expect(res.cookies.get('gcal_oauth_state')?.value).toBeTruthy()
  })

  it('短時間の連続接続開始は 429 で制限する', async () => {
    const { GET } = await import('./route')
    for (let i = 0; i < 10; i += 1) {
      limitMock.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 9 - i,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      })
    }
    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    for (let i = 0; i < 10; i += 1) {
      const res = await GET()
      expect(res.status).toBe(200)
    }

    const limited = await GET()
    expect(limited.status).toBe(429)
    expect(mockBuildOAuthUrl).toHaveBeenCalledTimes(10)
  })
})
