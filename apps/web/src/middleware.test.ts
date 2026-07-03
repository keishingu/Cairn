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

  it('/lp は / にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('/lp のクエリ文字列を維持して / にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp?p=alpineclub&utm_source=review'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/?p=alpineclub&utm_source=review')
  })

  it('/lp/index.html は / にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp/index.html'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('/index.html は / にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/index.html'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('/index.html のクエリ文字列を維持して / にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/index.html?utm_content=footer'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/?utm_content=footer')
  })

  it('/lp/ 配下の静的アセットはリダイレクトされない', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/lp/cairn-lp.css'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('未認証で保護ルートにアクセスすると /auth/login にリダイレクトされる', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const res = await middleware(makeRequest('/projects'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/login')
  })
})
