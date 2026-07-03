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
    membershipStatus: 'wm.membershipStatus',
  },
  activeWorkspaceMembers: {
    userId: 'awm.userId',
    workspaceId: 'awm.workspaceId',
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

  it('inactive な preferred workspace cookie は無視して active な所属へフォールバックする', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-inactive' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-active' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-active' },
      error: null,
    })
  })

  it('cache 済み workspace でも active membership を再確認して無効化を反映する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-1' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1' }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-2' }]))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    expect(second).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-2' },
      error: null,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(3)
  })

  it('cookie 付き request の cache は bearer-only request に流用しない', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-cookie' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-bearer' }]))

    const { getAuthContext } = await import('./get-auth-context')

    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-cookie' }) })
    const cookieScoped = await getAuthContext()

    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer token-123' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    const bearerOnly = await getAuthContext()

    expect(cookieScoped).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-cookie' },
      error: null,
    })
    expect(bearerOnly).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-bearer' },
      error: null,
    })
    expect(mockSupabase.auth.getUser).toHaveBeenNthCalledWith(1)
    expect(mockSupabase.auth.getUser).toHaveBeenNthCalledWith(2, 'token-123')
  })
})
