// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { GET } from './route'

describe('GET /api/auth/callback', () => {
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
})
