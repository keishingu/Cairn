// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import LoginPage from './page'

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword: mocks.signInWithPassword },
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('error=callback')
    mocks.push.mockReset()
    mocks.refresh.mockReset()
    mocks.signInWithPassword.mockReset()
    vi.unstubAllGlobals()
  })

  test('OAuthコールバックの失敗を再試行可能な日本語エラーで表示する', async () => {
    render(<LoginPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'サインインを完了できませんでした。もう一度お試しください。',
    )
  })

  test('通常ログイン後はチャット一覧へ遷移する', async () => {
    mocks.searchParams = new URLSearchParams()
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ needsWorkspace: false }),
    }))
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'サインイン' }))

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/chats'))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
