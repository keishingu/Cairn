// @vitest-environment node

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { expect, it, vi } from 'vitest'
import { middleware } from './middleware'

const { getClaims } = vi.hoisted(() => ({ getClaims: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'fixture' } }, error: null }),
      getClaims,
    },
  }),
}))

it.each([
  { error: new AuthRetryableFetchError('fixture', 0), status: 503, location: null },
  { error: new AuthApiError('fixture', 500, 'unexpected_failure'), status: 503, location: null },
  { error: new AuthApiError('fixture', 401, 'bad_jwt'), status: 307, location: 'https://cairn.example/auth/login' },
])('セッション取得後のJWT検証エラーを $status で扱う', async ({ error, status, location }) => {
  getClaims.mockResolvedValueOnce({ data: null, error })
  const response = await middleware(new NextRequest('https://cairn.example/projects'))
  expect(response.status).toBe(status)
  expect(response.headers.get('location')).toBe(location)
})
