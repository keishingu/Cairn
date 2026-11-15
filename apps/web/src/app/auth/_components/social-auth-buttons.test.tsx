// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SocialAuthButtons } from './social-auth-buttons'

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOAuth: mocks.signInWithOAuth },
  }),
}))

describe('SocialAuthButtons', () => {
  beforeEach(() => {
    delete window.cairnDesktop
    mocks.signInWithOAuth.mockReset()
    mocks.signInWithOAuth.mockResolvedValue({ error: null })
  })

  test('Desktop では SDK の認証 URL を同一ウィンドウの認証経路へ渡す', async () => {
    const startOAuth = vi.fn().mockResolvedValue(undefined)
    window.cairnDesktop = { startOAuth }
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null })
    render(<SocialAuthButtons />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Google でサインイン' }))
    await waitFor(() => expect(startOAuth).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/authorize', 'https://project.supabase.co', 'google'))
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ skipBrowserRedirect: true }) }))
    delete window.cairnDesktop
    vi.unstubAllEnvs()
  })

  test('Desktop の認証ページを開けないとエラーを表示し再試行できる', async () => {
    window.cairnDesktop = { startOAuth: vi.fn().mockRejectedValue(new Error('network failure')) }
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null })
    render(<SocialAuthButtons />)
    const button = screen.getByRole('button', { name: 'Apple でサインイン' })
    await userEvent.setup().click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('サインインを開始できませんでした')
    expect(button).toBeEnabled()
    delete window.cairnDesktop
  })

  test('Appleでサインインすると招待と遷移先を保ったコールバックを開始する', async () => {
    const user = userEvent.setup()
    render(<SocialAuthButtons inviteToken="invite-1" nextPath="/projects" />)

    await user.click(screen.getByRole('button', { name: 'Apple でサインイン' }))

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?invite=invite-1&next=%2Fprojects`,
        },
      })
    })
  })

  test('OAuth開始に失敗すると日本語のエラーを表示して再試行できる', async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: new Error('provider is unavailable') })
    const user = userEvent.setup()
    render(<SocialAuthButtons />)

    const appleButton = screen.getByRole('button', { name: 'Apple でサインイン' })
    await user.click(appleButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'サインインを開始できませんでした。しばらくしてからもう一度お試しください。',
    )
    expect(appleButton).toBeEnabled()
  })
})
