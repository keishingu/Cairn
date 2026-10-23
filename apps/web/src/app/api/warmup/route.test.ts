// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const { mockGetAuthUser, mockExecute } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockExecute: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@cairn/db', () => ({ db: { execute: mockExecute } }))
vi.mock('drizzle-orm', () => ({ sql: (strings: TemplateStringsArray) => strings.join('') }))

describe('GET /api/warmup', () => {
  it('未認証なら401を返しDBを叩かない', async () => {
    mockGetAuthUser.mockResolvedValue({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('認証済みならDBにpingして200を返す', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('DB pingが失敗してもbest-effortとして200を返す', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    mockExecute.mockRejectedValueOnce(new Error('connection failed'))
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
  })
})
