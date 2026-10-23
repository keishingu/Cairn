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
    mocks.signInWithOAuth.mockReset()
    mocks.signInWithOAuth.mockResolvedValue({ error: null })
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
