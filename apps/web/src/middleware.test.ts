import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getClaims = vi.fn()
const getSession = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims, getSession },
  }),
}))

// 認証済み / 未認証を getClaims の返り値で表現する
function authed(sub = 'u1') {
  return { data: { claims: { sub } }, error: null }
}
function unauthed() {
  return { data: null, error: null }
}

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

describe('middleware', () => {
  beforeEach(() => {
    getClaims.mockReset()
    getSession.mockReset()
    // verifyAccessToken は token 省略時にまず getSession でトークンを解決する
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null })
    // このトークンは JWT 形状ではないため header デコードに失敗し、JWKS 取得は発生しない想定。
    // 万一 fetch されても実ネットワークを叩かないようスタブしておく
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) }))
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321'
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = 'dummy'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('未認証で / にアクセスすると middleware は通過する', async () => {
    getClaims.mockResolvedValue(unauthed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('認証済みで / にアクセスすると /projects にリダイレクトされる', async () => {
    getClaims.mockResolvedValue(authed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/projects')
  })

  it('未認証で旧 LP パスにアクセスすると /auth/login にリダイレクトされる', async () => {
    getClaims.mockResolvedValue(unauthed())
    const { middleware } = await import('./middleware')

    for (const legacyPath of ['/lp', '/lp/', '/lp/index.html', '/index.html', '/lp/cairn-lp.css']) {
      const res = await middleware(makeRequest(legacyPath))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/auth/login')
    }
  })

  it('認証済みで旧 LP パスにアクセスしても / へリダイレクトしない', async () => {
    getClaims.mockResolvedValue(authed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('未認証で直下の LP 静的アセットにアクセスすると middleware は通過する', async () => {
    getClaims.mockResolvedValue(unauthed())
    const { middleware } = await import('./middleware')

    for (const assetPath of ['/cairn-lp.css', '/cairn-lp.js', '/og-image.png', '/og-image.svg']) {
      const res = await middleware(makeRequest(assetPath))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('未認証でもOAuth discovery metadataへアクセスできる', async () => {
    getClaims.mockResolvedValue(unauthed())
    const { middleware } = await import('./middleware')

    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/api/mcp',
      '/.well-known/oauth-authorization-server',
    ]) {
      const res = await middleware(makeRequest(path))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('未認証で保護ルートにアクセスすると /auth/login にリダイレクトされる', async () => {
    getClaims.mockResolvedValue(unauthed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/projects'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('webview=1 で入った後は cairn-webview cookie で x-webview を維持する', async () => {
    getClaims.mockResolvedValue(authed())
    const { middleware } = await import('./middleware')

    const initial = await middleware(makeRequest('/projects?webview=1'))
    expect(initial.cookies.get('cairn-webview')?.value).toBe('1')

    const followup = makeRequest('/settings/account')
    followup.cookies.set('cairn-webview', '1')
    const res = await middleware(followup)

    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-request-x-webview')).toBe('1')
  })

  it('認証済みでも /auth/mobile-handoff は /projects に潰さない', async () => {
    getClaims.mockResolvedValue(authed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/auth/mobile-handoff?redirect=%2Fai%3Fwebview%3D1'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('認証済みでも /auth/mobile-signout は /projects に潰さない', async () => {
    getClaims.mockResolvedValue(authed())
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/auth/mobile-signout?webview=1'))
    expect(res.headers.get('location')).toBeNull()
  })
})
