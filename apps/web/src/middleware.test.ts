import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser },
  }),
}))

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'))
}

describe('middleware', () => {
  beforeEach(() => {
    getUser.mockReset()
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321'
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = 'dummy'
  })

  it('未認証で / にアクセスすると middleware は通過する', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('認証済みで / にアクセスすると /projects にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/projects')
  })

  it('未認証で旧 LP パスにアクセスすると /auth/login にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')

    for (const legacyPath of ['/lp', '/lp/', '/lp/index.html', '/index.html', '/lp/cairn-lp.css']) {
      const res = await middleware(makeRequest(legacyPath))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/auth/login')
    }
  })

  it('認証済みで旧 LP パスにアクセスしても / へリダイレクトしない', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('未認証で直下の LP 静的アセットにアクセスすると middleware は通過する', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')

    for (const assetPath of ['/cairn-lp.css', '/cairn-lp.js', '/og-image.png', '/og-image.svg']) {
      const res = await middleware(makeRequest(assetPath))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('未認証で保護ルートにアクセスすると /auth/login にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/projects'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('webview=1 で入った後は cairn-webview cookie で x-webview を維持する', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
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
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/auth/mobile-handoff?redirect=%2Fai%3Fwebview%3D1'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('認証済みでも /auth/mobile-signout は /projects に潰さない', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/auth/mobile-signout?webview=1'))
    expect(res.headers.get('location')).toBeNull()
  })
})
