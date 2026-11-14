// @vitest-environment node

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { middleware } from './middleware'

const cookieName = 'sb-auth-fixture-auth-token'
const user = { id: 'fixture-user' }
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

function session(expiresAt: number) {
  return {
    access_token: [encode({ alg: 'HS256' }), encode({
      sub: user.id, exp: expiresAt, aud: 'authenticated', role: 'authenticated',
    }), 'c2ln'].join('.'),
    refresh_token: expiresAt < Date.now() / 1000 ? 'expired-fixture' : 'updated-fixture',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user,
  }
}

describe('middleware の期限切れセッション更新', () => {
  let expiredCookie: string
  let refresh: ReturnType<typeof vi.fn<() => Response>>

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth-fixture.example')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fixture-key')
    const now = Math.floor(Date.now() / 1000)
    expiredCookie = 'base64-' + encode(session(now - 60))
    refresh = vi.fn(() => Response.json(session(now + 3600)))
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return refresh()
      if (url.pathname === '/auth/v1/user') return Response.json(user)
      throw new Error('想定外の認証リクエスト')
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  function request(path: string) {
    return new NextRequest(new URL(path, 'https://cairn.example'), {
      headers: { cookie: `${cookieName}=${expiredCookie}; unrelated=keep`, 'user-agent': 'iPhone' },
    })
  }

  it('保護ページでは更新Cookieを下流リクエストとレスポンスの両方に渡す', async () => {
    const response = await middleware(request('/projects?webview=1'))
    const newCookie = response.cookies.get(cookieName)
    expect(refresh).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBeNull()
    expect(newCookie?.value).toBeTruthy()
    expect(newCookie?.value).not.toBe(expiredCookie)
    expect(response.headers.get('x-middleware-request-cookie')).toContain(`${cookieName}=${newCookie?.value}`)
    expect(response.headers.get('x-middleware-request-cookie')).toContain('unrelated=keep')
    expect(response.headers.get('x-middleware-request-x-device')).toBe('mobile')
    expect(response.headers.get('x-middleware-request-x-webview')).toBe('1')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it.each(['/', '/auth/login'])('期限切れCookieで %s を開くと更新Cookie付きでチャットへ移動する', async (path) => {
    const response = await middleware(request(`${path}?webview=1`))
    expect(refresh).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe('https://cairn.example/chats')
    expect(response.cookies.get(cookieName)?.value).toBeTruthy()
    expect(response.cookies.get(cookieName)?.value).not.toBe(expiredCookie)
    expect(response.cookies.has('cairn-webview')).toBe(true)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.has('x-middleware-override-headers')).toBe(false)
  })

  it('更新トークン失効時は削除Cookie付きで保護ページからログインへ移動する', async () => {
    refresh.mockReturnValueOnce(Response.json({ error_code: 'refresh_token_not_found' }, { status: 400 }))
    const response = await middleware(request('/projects'))
    expect(response.headers.get('location')).toBe('https://cairn.example/auth/login')
    expect(response.cookies.get(cookieName)?.maxAge).toBe(0)
  })

  it('更新のHTTP 500を再試行し、復旧したCookieを保持する', async () => {
    refresh.mockReturnValueOnce(Response.json({}, { status: 500 }))
    const response = await middleware(request('/projects'))
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get(cookieName)?.value).toBeTruthy()
  })
})
