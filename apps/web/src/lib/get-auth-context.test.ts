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

  it('workspace header があれば cookie より優先する', async () => {
    mockHeaders.mockResolvedValue(new Headers({
      Authorization: 'Bearer token-123',
      'x-cairn-workspace-id': 'ws-header',
    }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-cookie' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-header' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-header' },
      error: null,
    })
  })

  it('無効な workspace header は cookie に fallback せず 403 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers({
      Authorization: 'Bearer token-123',
      'x-cairn-workspace-id': 'ws-header',
    }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-cookie' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(403)
    await expect(result.error?.json()).resolves.toEqual({ error: 'Workspace not found' })
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('明示 workspace header は cache hit があっても毎回所属確認する', async () => {
    mockHeaders.mockResolvedValue(new Headers({
      Authorization: 'Bearer token-123',
      'x-cairn-workspace-id': 'ws-header',
    }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-header' }]))
      .mockReturnValueOnce(selectChain([]))

    const { getAuthContext } = await import('./get-auth-context')

    await expect(getAuthContext()).resolves.toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-header' },
      error: null,
    })

    const result = await getAuthContext()

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(403)
    await expect(result.error?.json()).resolves.toEqual({ error: 'Workspace not found' })
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('getAuthUser も Cookie 認証で getUser() を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith()
    expect(result).toEqual({ userId: 'user-1', error: null })
  })
})
