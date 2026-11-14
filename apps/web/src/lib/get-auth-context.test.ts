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
      getUser: vi.fn(),
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
const okClaims = { data: { claims: { sub: 'user-1', aud: 'authenticated', role: 'authenticated' } }, error: null }
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

  it('getAuthUser はAuthサーバーへ再照合して削除済みユーザーを許可しない', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith(undefined)
    expect(result).toEqual({ userId: 'user-1', user: { id: 'user-1' }, error: null })
  })

  it('getAuthUser は渡されたリクエストヘッダーを優先する', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const { getAuthUser } = await import('./get-auth-context')
    await getAuthUser('Bearer request-token')

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('request-token')
  })

  it('getAuthUser はAuthから削除済みなら有効期限内のBearer JWTでも401を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer deleted-user-token' }))
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User not found' },
    })

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('deleted-user-token')
    expect(result.userId).toBeNull()
    expect(result.error?.status).toBe(401)
  })

  // 「Cairn でログイン」で外部アプリに発行されたトークン（client_id 付き）は、通常ログインと同じ
  // ユーザー JWT として署名検証を通る。Cairn の API には Bearer・Cookie のどちらでも通さない
  const externalClientClaims = { data: { claims: { sub: 'user-1', aud: 'authenticated', role: 'authenticated', client_id: 'external-app' } }, error: null }

  it('外部アプリのトークンは Bearer で送られても getAuthContext で 401 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer external-token' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(externalClientClaims)

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('外部アプリのトークンはセッション Cookie に入れて送られても getAuthContext で 401 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(externalClientClaims)

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(mockSupabase.auth.getClaims).toHaveBeenCalledWith(SESSION_TOKEN, undefined)
    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(401)
  })

  it('外部アプリのトークンは Bearer で送られても getAuthUser で 401 を返し、Auth に再照合しない', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer external-token' }))
    mockSupabase.auth.getClaims.mockResolvedValue(externalClientClaims)

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(result.userId).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled()
  })

  it('外部アプリのトークンはセッション Cookie に入れて送られても getAuthUser で 401 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockSupabase.auth.getClaims.mockResolvedValue(externalClientClaims)

    const { getAuthUser } = await import('./get-auth-context')
    const result = await getAuthUser()

    expect(mockSupabase.auth.getClaims).toHaveBeenCalledWith(SESSION_TOKEN, undefined)
    expect(result.userId).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled()
  })

  it('外部アプリの ID トークンを Bearer で送られても getAuthContext で 401 を返す', async () => {
    mockHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer external-id-token' }))
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', aud: 'external-app-client-id' } },
      error: null,
    })

    const { getAuthContext } = await import('./get-auth-context')
    const result = await getAuthContext()

    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
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

  it('所属の再照合は 30 秒以内なら DB を引かず、期限後は非活性化を反映する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
    try {
      mockHeaders.mockResolvedValue(new Headers())
      mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
      mockSupabase.auth.getClaims.mockResolvedValue(okClaims)

      const { getAuthContext, MEMBERSHIP_RECHECK_TTL_MS } = await import('./get-auth-context')

      mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))
      const first = await getAuthContext()
      expect(first).toEqual({
        ctx: { userId: 'user-1', workspaceId: 'ws-1', role: 'member' },
        error: null,
      })

      mockDb.select.mockClear()
      const second = await getAuthContext()
      expect(mockDb.select).not.toHaveBeenCalled()
      expect(second).toEqual(first)

      vi.setSystemTime(new Date(Date.now() + MEMBERSHIP_RECHECK_TTL_MS + 1))
      mockDb.select
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
      const third = await getAuthContext()
      expect(mockDb.select).toHaveBeenCalled()
      expect(third.ctx).toBeNull()
      expect(third.error?.status).toBe(403)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['owner', 'admin'] as const)('%s は 30 秒以内でも毎回再照合し、降格をすぐ反映する', async (role) => {
    mockHeaders.mockResolvedValue(new Headers())
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) })
    mockSupabase.auth.getClaims.mockResolvedValue(okClaims)

    const { getAuthContext } = await import('./get-auth-context')

    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role }]))
    const first = await getAuthContext()
    expect(first.ctx?.role).toBe(role)

    // キャッシュの期限内に member へ降格された
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'member' }]))
    const second = await getAuthContext()
    expect(mockDb.select).toHaveBeenCalledTimes(2)
    expect(second.ctx?.role).toBe('member')
  })
})
