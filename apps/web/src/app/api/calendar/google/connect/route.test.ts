// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { resetRequestRateLimitForTest } from '@/lib/request-rate-limit'

const { mockGetAuthContext, mockBuildOAuthUrl } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockBuildOAuthUrl: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/google-calendar-api', () => ({
  buildOAuthUrl: mockBuildOAuthUrl,
}))

describe('GET /api/calendar/google/connect', () => {
  beforeEach(() => {
    process.env['GOOGLE_CALENDAR_CLIENT_ID'] = 'client-id'
    process.env['GOOGLE_CALENDAR_REDIRECT_URI'] = 'http://localhost/callback'
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    mockBuildOAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth')
  })

  afterEach(() => {
    delete process.env['GOOGLE_CALENDAR_CLIENT_ID']
    delete process.env['GOOGLE_CALENDAR_REDIRECT_URI']
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
      const res = await GET()
      expect(res.status).toBe(200)
    }

    const limited = await GET()
    expect(limited.status).toBe(429)
    expect(mockBuildOAuthUrl).toHaveBeenCalledTimes(10)
  })
})
