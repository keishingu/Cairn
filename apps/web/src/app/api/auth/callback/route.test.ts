// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockUser, mockSupabase, mockDb } = vi.hoisted(() => {
  const mockUser = {
    id: 'user-00000001',
    email: 'fallback@example.com',
    user_metadata: { display_name: '退会したユーザー' },
  }
  const mockSupabase = {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
  }
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  }
  return { mockUser, mockSupabase, mockDb }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'profiles.id' },
}))

vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq-result') }))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

function insertChainPlain() {
  return { values: vi.fn().mockResolvedValue([]) }
}

describe('GET /api/auth/callback', () => {
  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
  })

  it('OAuth 表示名が予約済みでも fallback email で profile を作る', async () => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const insertValues = vi.fn().mockResolvedValue([])
    mockDb.insert.mockReturnValueOnce({ values: insertValues })

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/auth/callback?code=test-code'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/onboarding')
    expect(insertValues).toHaveBeenCalledWith({
      id: mockUser.id,
      displayName: mockUser.email,
    })
  })
})
