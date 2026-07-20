// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockLimit } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockLimit: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  },
  workspaceStorageUsage: { workspaceId: 'wsu.workspaceId' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq') }))

describe('/api/workspaces/storage-usage GET', () => {
  it('行が存在する場合は使用量を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: 'ws-1' }, error: null })
    mockLimit.mockResolvedValue([{ originalBytes: 12345, derivedBytes: 0 }])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ originalBytes: 12345, derivedBytes: 0 })
  })

  it('行が存在しない場合は0を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: 'ws-2' }, error: null })
    mockLimit.mockResolvedValue([])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ originalBytes: 0, derivedBytes: 0 })
  })

  it('未認証の場合はエラーレスポンスをそのまま返す', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: errorResponse })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(401)
  })
})
