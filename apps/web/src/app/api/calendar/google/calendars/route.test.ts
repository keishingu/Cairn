// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockGetGcalAccount,
  mockGetFreshToken,
  mockListCalendars,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetGcalAccount: vi.fn(),
  mockGetFreshToken: vi.fn(),
  mockListCalendars: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/google-calendar-account', () => ({
  getGcalAccount: mockGetGcalAccount,
  getFreshToken: mockGetFreshToken,
  updateGcalMeta: vi.fn(),
}))

vi.mock('@/lib/google-calendar-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google-calendar-api')>('@/lib/google-calendar-api')
  return {
    ...actual,
    listCalendars: mockListCalendars,
  }
})

describe('/api/calendar/google/calendars GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1' },
      error: null,
    })
    mockGetGcalAccount.mockResolvedValue({
      id: 'account-1',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(),
      meta: { googleAccountEmail: 'user@example.com', selectedCalendars: [] },
    })
    mockGetFreshToken.mockResolvedValue({ accessToken: 'fresh-token' })
    mockListCalendars.mockResolvedValue([])
  })

  it('refresh token が失効しているときは再接続用の 409 を返す', async () => {
    mockGetFreshToken.mockRejectedValueOnce(
      new Error('Token refresh failed: {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}'),
    )
    const { GET } = await import('./route')

    const res = await GET()
    const body = await res.json() as { error: string; code: string }

    expect(res.status).toBe(409)
    expect(body.code).toBe('GOOGLE_RECONNECT_REQUIRED')
    expect(body.error).toContain('再接続')
  })
})
