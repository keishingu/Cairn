// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockHeaders, mockCookies, mockSupabase, mockDb, mockUser } = vi.hoisted(() => {
  const mockHeaders = vi.fn()
  const mockCookies = vi.fn()
  const mockUser = { id: 'user-1' }
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
  }
  const mockDb = {
    select: vi.fn(),
  }
  return { mockHeaders, mockCookies, mockSupabase, mockDb, mockUser }
})

vi.mock('next/headers', () => ({
  headers: mockHeaders,
  cookies: mockCookies,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  activeWorkspaceMembers: {
    userId: 'awm.userId',
    workspaceId: 'awm.workspaceId',
    role: 'awm.role',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  const whereResult = Promise.resolve(result) as Promise<unknown[]> & {
    limit: ReturnType<typeof vi.fn>
  }
  whereResult.limit = vi.fn().mockResolvedValue(result)
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  }
}

describe('get-auth-context', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('Cookie 認証でも getUser() でユーザーを検証する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith()
    expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
  })

  it('Bearer 認証では token 付き getUser(token) を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer token-123' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-2' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('token-123')
    expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-2' },
      error: null,
    })
  })

  it('getAuthUser も Cookie 認証で getUser() を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith()
    expect(result).toEqual({ userId: 'user-1', error: null })
  })

  it('非活性な preferred workspace cookie は無視して active 所属へフォールバックする', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-inactive' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-active', role: 'member' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result).toEqual({ ctx: { userId: 'user-1', workspaceId: 'ws-active' }, error: null })
  })

  it('warm cache があっても active membership を毎回再照合し、非活性化を即時反映する', async () => {
    mockHeaders
      .mockResolvedValueOnce(new Headers())
      .mockResolvedValueOnce(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const { getAuthContext } = await import('./get-auth-context')

    // 1回目: active 所属あり → cache に載る
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))
    const first = await getAuthContext()
    expect(first).toEqual({ ctx: { userId: 'user-1', workspaceId: 'ws-1' }, error: null })

    // 2回目: 非活性化され active view から消えた → cached ws-1 の再照合もフォールバックも失敗 → 403
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const second = await getAuthContext()
    expect(second.ctx).toBeNull()
    expect(second.error).not.toBeNull()
  })

  it('無効な workspace cookie からのフォールバック結果も scoped cache に保存する', async () => {
    const firstHeaders = new Headers()
    const secondHeaders = new Headers()

    mockHeaders
      .mockResolvedValueOnce(firstHeaders)
      .mockResolvedValueOnce(secondHeaders)
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'ws-missing' }),
    })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    expect(second).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })
})
