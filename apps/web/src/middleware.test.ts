import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const limitMock = vi.fn()
const slidingWindowMock = vi.fn()
const redisCtorMock = vi.fn()
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser },
  }),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindowMock

    constructor() {}

    limit = limitMock
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) {
      redisCtorMock(config)
    }
  },
}))

function makeRequest(pathname: string, init?: RequestInit): NextRequest {
  return new NextRequest(
    new URL(pathname, 'http://localhost:3000'),
    init as ConstructorParameters<typeof NextRequest>[1],
  )
}

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    getUser.mockReset()
    limitMock.mockReset()
    slidingWindowMock.mockReset()
    redisCtorMock.mockReset()
    consoleErrorSpy.mockClear()
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321'
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = 'dummy'
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
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

  it('rate limit 対象 API は上限超過で 429 を返す', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    limitMock.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    })

    const { middleware } = await import('./middleware')
    const res = await middleware(
      makeRequest('/api/auth/webview-handoff', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
    )

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('rate limit 対象 API は Redis 設定がないと 503 を返す', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    delete process.env['UPSTASH_REDIS_REST_URL']
    delete process.env['UPSTASH_REDIS_REST_TOKEN']

    const { middleware } = await import('./middleware')
    const res = await middleware(
      makeRequest('/api/auth/webview-handoff', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.20' },
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Rate limit is unavailable' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('rate limit 対象 API は IP を解決できないと 400 を返す', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const { middleware } = await import('./middleware')
    const res = await middleware(
      makeRequest('/api/auth/webview-handoff', {
        method: 'POST',
      }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Unable to determine client IP for rate limiting' })
    expect(getUser).not.toHaveBeenCalled()
  })
})
