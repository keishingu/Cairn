// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockWhere } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockWhere: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockWhere,
      }),
    }),
  },
  files: { workspaceId: 'files.workspaceId', fileSize: 'files.fileSize' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq'), sql: vi.fn(() => 'sql'), and: vi.fn(() => 'and'), inArray: vi.fn(() => 'inArray') }))

describe('/api/workspaces/storage-usage GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('member は files.file_size の集約結果を数値で受け取る', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: 'ws-1', userId: 'u-1', role: 'member' }, error: null })
    // SUM(bigint) は drizzle では文字列で返る
    mockWhere.mockResolvedValue([{ originalBytes: '12345' }])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ originalBytes: 12345 })
  })

  it('ファイルが無い場合は0を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: 'ws-2', userId: 'u-1', role: 'admin' }, error: null })
    mockWhere.mockResolvedValue([{ originalBytes: '0' }])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ originalBytes: 0 })
  })

  it('ゲストはワークスペース全体の合計を取得できず 403 になる', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { workspaceId: 'ws-1', userId: 'g-1', role: 'guest' }, error: null })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(403)
    // 集約クエリまで到達しない
    expect(mockWhere).not.toHaveBeenCalled()
  })

  it('未認証の場合はエラーレスポンスをそのまま返す', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: errorResponse })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(401)
  })
})
