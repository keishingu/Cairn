// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi, beforeEach } from 'vitest'
import { GET } from './route'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  }),
}))

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset()
  })

  test('OAuth失敗時は安全な再試行文脈を保ってログイン画面へ戻す', async () => {
    const response = await GET(
      new Request('https://oss-cairn.com/api/auth/callback?invite=invite-1&next=%2Fprojects'),
    )

    expect(response.headers.get('location')).toBe(
      'https://oss-cairn.com/auth/login?error=callback&invite=invite-1&next=%2Fprojects',
    )
  })

  test('安全でない遷移先はOAuth失敗時のログインURLへ渡さない', async () => {
    const response = await GET(
      new Request('https://oss-cairn.com/api/auth/callback?next=https%3A%2F%2Fexample.com'),
    )

    expect(response.headers.get('location')).toBe('https://oss-cairn.com/auth/login?error=callback')
  })

  test('ログイン方法連携のidentity衝突は設定画面へ日本語用キーで戻す', async () => {
    const response = await GET(
      new Request(
        'https://oss-cairn.com/api/auth/callback?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked&next=%2Fsettings%2Faccount%3FloginLinked%3Dapple',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://oss-cairn.com/settings/account?loginLinkError=identity_already_exists&loginLinkProvider=apple',
    )
  })

  test('ログイン方法連携のcode交換失敗も設定画面へ戻す', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'identity_already_exists', message: 'Identity is already linked to another user' },
    })

    const response = await GET(
      new Request(
        'https://oss-cairn.com/api/auth/callback?code=abc&next=%2Fsettings%2Faccount%3FloginLinked%3Dgoogle',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://oss-cairn.com/settings/account?loginLinkError=identity_already_exists&loginLinkProvider=google',
    )
  })
})
