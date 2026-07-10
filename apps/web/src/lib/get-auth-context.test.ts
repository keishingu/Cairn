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

  it('同じ preferred workspace でも active membership を毎回再照合する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-preferred' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred' }]))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-preferred' },
      error: null,
    })
    expect(second).toEqual(first)
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('invalidateWorkspaceCacheForUser() 後は DB を引き直す', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-preferred' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred' }]))

    const { getAuthContext, invalidateWorkspaceCacheForUser } = await import('./get-auth-context')

    await getAuthContext()
    invalidateWorkspaceCacheForUser('user-1')
    const result = await getAuthContext()

    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-preferred' },
      error: null,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('inactive な preferred workspace の fallback を同じ preferred key へキャッシュしない', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-preferred' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-fallback' }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-preferred' }]))

    const { getAuthContext } = await import('./get-auth-context')

    const first = await getAuthContext()
    const second = await getAuthContext()

    expect(first).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-fallback' },
      error: null,
    })
    expect(second).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-preferred' },
      error: null,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(3)
  })

  it('非活性な preferred workspace cookie は無視して active 所属へフォールバックする', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-inactive' }) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    // 1回目: preferred(ws-inactive) は active view に無い → []、2回目: フォールバックで active 所属
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-active' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result).toEqual({ ctx: { userId: 'user-1', workspaceId: 'ws-active' }, error: null })
  })

  it('warm cache があっても active membership を毎回再照合し、非活性化を即時反映する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const { getAuthContext } = await import('./get-auth-context')

    // 1回目: active 所属あり → cache に載る
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1' }]))
    const first = await getAuthContext()
    expect(first).toEqual({ ctx: { userId: 'user-1', workspaceId: 'ws-1' }, error: null })

    // 2回目: 非活性化され active view から消えた → cache 候補を再照合して弾き、他 active も無い → 403
    mockDb.select
      .mockReturnValueOnce(selectChain([])) // cached ws-1 の再照合 = 空
      .mockReturnValueOnce(selectChain([])) // フォールバックも空
    const second = await getAuthContext()
    expect(second.ctx).toBeNull()
    expect(second.error).not.toBeNull()
  })
})
