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
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    role: 'wm.role',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

function selectChainReject(error: Error) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(error),
      }),
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
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith()
    expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1', workspaceRole: 'member' },
      error: null,
    })
  })

  it('Bearer 認証では token 付き getUser(token) を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer token-123' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-2', role: 'admin' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('token-123')
    expect(mockSupabase.auth.getUser).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-2', workspaceRole: 'admin' },
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

  it('同一リクエスト内の workspace role を permissions で再利用できる', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'owner' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const { getWorkspaceRole } = await import('./permissions')

    const auth = await getAuthContext()

    expect(auth).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1', workspaceRole: 'owner' },
      error: null,
    })
    await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBe('owner')
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('warm cache の再照会が失敗しても 500 レスポンスに変換する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))
      .mockReturnValueOnce(selectChainReject(new Error('db failed')))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1', workspaceRole: 'member' },
      error: null,
    })
    expect(second.ctx).toBeNull()
    expect(second.error?.status).toBe(500)
  })

  it('無効な preferred workspace の fallback を preferred key に固定しない', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-preferred' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-fallback', role: 'member' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred', role: 'admin' }]))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-fallback', workspaceRole: 'member' },
      error: null,
    })
    expect(second).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-preferred', workspaceRole: 'admin' },
      error: null,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(3)
  })
})
