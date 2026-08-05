// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHeaders, mockCookies, mockSupabase, mockDb, mockEq } = vi.hoisted(() => {
  const mockHeaders = vi.fn()
  const mockCookies = vi.fn()
  const mockSupabase = {
    auth: {
      getClaims: vi.fn(),
      getSession: vi.fn(),
    },
  }
  const mockDb = {
    select: vi.fn(),
  }
  const mockEq = vi.fn(() => 'eq')
  return { mockHeaders, mockCookies, mockSupabase, mockDb, mockEq }
})

// verifyAccessToken 内の JWKS 取得は Cookie 認証の検証経路に影響しないよう、
// NEXT_PUBLIC_SUPABASE_URL 未設定時は fetch せず getClaims に委ねる（本テストは URL 未設定）
const okClaims = { data: { claims: { sub: 'user-1' } }, error: null }
// Cookie 経路（token 省略時）は getSession でトークンを解決してから getClaims に渡す。
// このトークンは JWT 形状ではないため header デコードに失敗し、JWKS 取得は発生しない
const SESSION_TOKEN = 'session-access-token'

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
  eq: mockEq,
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
  beforeEach(() => {
    // JWKS の実フェッチを避け、getClaims 経由の検証（Cookie/Bearer）だけを検証する
    delete process.env['NEXT_PUBLIC_SUPABASE_URL']
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: SESSION_TOKEN } },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('Cookie 認証でも getClaims() でユーザーを検証する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    // Cookie 経路は verifyAccessToken が getSession でトークンを解決してから getClaims に渡す
    expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
    expect(mockSupabase.auth.getClaims).toHaveBeenCalledWith(SESSION_TOKEN, undefined)
    expect(mockSupabase.auth.getClaims).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
  })

  it('Bearer 認証では token 付き getClaims(token) を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer token-123' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-2' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getClaims).toHaveBeenCalledWith('token-123', undefined)
    expect(mockSupabase.auth.getClaims).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ctx: { userId: 'user-1', workspaceId: 'ws-2' },
      error: null,
    })
  })

  it('検証に失敗したら 401 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer bad' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue({ data: null, error: { message: 'invalid' } })

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result.ctx).toBeNull()
    expect(result.error).not.toBeNull()
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('PATはMCPの検証済み実行コンテキスト外では許可ルートでも拒否する', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ Authorization: 'Bearer cairn_pat_not-a-real-token' }),
    )
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext({
      allowApiToken: true,
      requiredApiTokenScope: 'read',
    })

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockSupabase.auth.getClaims).not.toHaveBeenCalled()
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('OAuth access tokenは通常RESTの認証情報として受け付けない', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer cairn_oauth_at_test' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'read' })

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockSupabase.auth.getClaims).not.toHaveBeenCalled()
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('検証済みMCPリクエスト内ではOAuth write tokenをread/write両方に使える', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer cairn_oauth_at_test' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })

    const { runWithVerifiedMcpRequest } = await import('./mcp-request-context')
    const { getAuthContext } = await import('./get-auth-context')
    const credential = {
      rawToken: 'cairn_oauth_at_test',
      tokenId: 'token-1',
      clientId: 'client-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      role: 'member' as const,
      scope: 'write' as const,
      expiresAt: new Date(Date.now() + 60_000),
    }

    await runWithVerifiedMcpRequest(credential, async () => {
      await expect(
        getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'read' }),
      ).resolves.toEqual({
        ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
        error: null,
      })
      await expect(
        getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'write' }),
      ).resolves.toEqual({
        ctx: { userId: 'user-1', workspaceId: 'workspace-1', role: 'member' },
        error: null,
      })
    })
  })

  it('検証済みOAuth read tokenによるwrite操作を拒否する', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer cairn_oauth_at_read' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })

    const { runWithVerifiedMcpRequest } = await import('./mcp-request-context')
    const { getAuthContext } = await import('./get-auth-context')
    const result = await runWithVerifiedMcpRequest(
      {
        rawToken: 'cairn_oauth_at_read',
        tokenId: 'token-1',
        clientId: 'client-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: 'member',
        scope: 'read',
        expiresAt: new Date(Date.now() + 60_000),
      },
      () => getAuthContext({ allowApiToken: true, requiredApiTokenScope: 'write' }),
    )

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it('getAuthUser も Cookie 認証で getClaims() を使う', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getClaims).toHaveBeenCalledWith(SESSION_TOKEN, undefined)
    expect(result).toEqual({ userId: 'user-1', error: null })
  })

  it('非活性な preferred workspace cookie は無視して active 所属へフォールバックする', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'ws-inactive' }) })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    // 1回目: preferred(ws-inactive) は active view に無い → []、2回目: フォールバックで active 所属
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-active' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result).toEqual({ ctx: { userId: 'user-1', workspaceId: 'ws-active' }, error: null })
  })

  it('ネイティブの workspace header を Cookie より優先する', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        Authorization: 'Bearer token-123',
        'X-Cairn-Workspace-Id': 'ws-native',
      }),
    )
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'ws-cookie' }),
    })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-native', role: 'member' }]))

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockEq).toHaveBeenCalledWith('awm.workspaceId', 'ws-native')
    expect(result).toEqual({
      ctx: {
        userId: 'user-1',
        workspaceId: 'ws-native',
        role: 'member',
      },
      error: null,
    })
  })

  it('warm cache があっても active membership を毎回再照合し、非活性化を即時反映する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)

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
