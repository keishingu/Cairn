// @vitest-environment node

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { signOutCurrentSession } from './sign-out'
import { createClient } from './client'

vi.mock('./client', () => ({ createClient: vi.fn() }))

it('WebViewのログアウトは独立したネイティブ・別端末のセッションを維持する', async () => {
  const active = new Set(['webview', 'native', 'other-device'])
  const fetchAuth: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname === '/auth/v1/token') {
      return Response.json({
        access_token: 'webview',
        refresh_token: 'fixture',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'fixture-user' },
      })
    }
    if (url.pathname === '/auth/v1/logout') {
      const authorization = new Headers(init?.headers).get('authorization')
      if (url.searchParams.get('scope') === 'local' && authorization === 'Bearer webview') {
        active.delete('webview')
      } else {
        active.clear()
      }
      return new Response(null, { status: 204 })
    }
    throw new Error('想定外の認証リクエスト')
  }

  const webView = createSupabaseClient('https://auth-fixture.example', 'fixture-key', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchAuth },
  })
  const signIn = await webView.auth.signInWithPassword({ email: 'fixture@example.test', password: 'fixture' })
  expect(signIn.error).toBeNull()
  vi.mocked(createClient).mockReturnValue(webView)

  expect(await signOutCurrentSession()).toBe(true)
  expect((await webView.auth.getSession()).data.session).toBeNull()
  expect([...active]).toEqual(['native', 'other-device'])
})
