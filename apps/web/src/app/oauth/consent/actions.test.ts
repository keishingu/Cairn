// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthUser, mockOauth, mockRedirect } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockOauth: { approveAuthorization: vi.fn(), denyAuthorization: vi.fn() },
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/i18n/request-locale', () => ({ readRequestLocale: vi.fn().mockResolvedValue({ locale: 'en' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { oauth: mockOauth } }),
}))

import { decideOidcAuthorization } from './actions'

const AUTHORIZATION_ID = '4oyac733lgevzscx7jvbi2ufm3nvz2u4'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe('decideOidcAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', user: { id: 'user-1' }, error: null })
  })

  it('許可すると Supabase が返した戻り先（code 付き）へリダイレクトする', async () => {
    mockOauth.approveAuthorization.mockResolvedValue({
      data: { redirect_url: 'https://app.example/callback?code=abc&state=xyz' },
      error: null,
    })

    await expect(
      decideOidcAuthorization(null, form({ authorization_id: AUTHORIZATION_ID, decision: 'approve' })),
    ).rejects.toThrow('REDIRECT:https://app.example/callback?code=abc&state=xyz')
    expect(mockOauth.approveAuthorization).toHaveBeenCalledWith(AUTHORIZATION_ID, { skipBrowserRedirect: true })
    expect(mockOauth.denyAuthorization).not.toHaveBeenCalled()
  })

  it('拒否すると denyAuthorization を呼び、戻り先へリダイレクトする', async () => {
    mockOauth.denyAuthorization.mockResolvedValue({
      data: { redirect_url: 'https://app.example/callback?error=access_denied' },
      error: null,
    })

    await expect(
      decideOidcAuthorization(null, form({ authorization_id: AUTHORIZATION_ID, decision: 'deny' })),
    ).rejects.toThrow('REDIRECT:https://app.example/callback?error=access_denied')
    expect(mockOauth.approveAuthorization).not.toHaveBeenCalled()
  })

  it('authorization_id が不正なら Supabase を呼ばずにエラーを返す', async () => {
    const result = await decideOidcAuthorization(null, form({ authorization_id: 'bad/../x', decision: 'approve' }))

    expect(result).toEqual({ error: 'This sign-in request is invalid. Return to the app and try again.' })
    expect(mockOauth.approveAuthorization).not.toHaveBeenCalled()
  })

  it('ログインしていなければ同意画面へ戻るログイン画面へ送る', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: null, user: null, error: new Response(null, { status: 401 }) })

    await expect(
      decideOidcAuthorization(null, form({ authorization_id: AUTHORIZATION_ID, decision: 'approve' })),
    ).rejects.toThrow(
      `REDIRECT:/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${AUTHORIZATION_ID}`)}`,
    )
    expect(mockOauth.approveAuthorization).not.toHaveBeenCalled()
  })

  it('Supabase が失敗したら戻り先へ送らずにエラーを表示する', async () => {
    mockOauth.approveAuthorization.mockResolvedValue({ data: null, error: { message: 'expired' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await decideOidcAuthorization(null, form({ authorization_id: AUTHORIZATION_ID, decision: 'approve' }))

    expect(result).toEqual({ error: 'Could not complete the sign-in request. Return to the app and try again.' })
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
