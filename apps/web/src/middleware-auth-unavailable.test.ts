// @vitest-environment node

import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { expect, it, vi } from 'vitest'
import { middleware } from './middleware'

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: new AuthRetryableFetchError('fixture', 503),
      }),
    },
  }),
}))

it('認証サービス障害時はCookieを消さず、保護ページで再試行を案内する', async () => {
  const response = await middleware(new NextRequest('https://cairn.example/projects', {
    headers: { 'accept-language': 'ja' },
  }))

  expect(response.status).toBe(503)
  expect(response.headers.has('location')).toBe(false)
  expect(response.cookies.getAll()).toHaveLength(0)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.text()).toContain('再試行')
})
