// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginMethodsSettings } from './login-methods-settings'

const mocks = vi.hoisted(() => ({
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
  searchParamsGet: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUserIdentities: mocks.getUserIdentities,
      linkIdentity: mocks.linkIdentity,
      unlinkIdentity: mocks.unlinkIdentity,
    },
  }),
}))

function renderLoginMethods() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginMethodsSettings />
    </QueryClientProvider>,
  )
}

describe('LoginMethodsSettings', () => {
  beforeEach(() => {
    mocks.getUserIdentities.mockReset()
    mocks.linkIdentity.mockReset()
    mocks.unlinkIdentity.mockReset()
    mocks.searchParamsGet.mockReset()
    mocks.searchParamsGet.mockReturnValue(null)
    mocks.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          {
            identity_id: 'email-1',
            provider: 'email',
            id: 'email-1',
            user_id: 'u1',
            identity_data: { email: 'taro@example.com' },
          },
        ],
      },
      error: null,
    })
    mocks.linkIdentity.mockResolvedValue({ data: { provider: 'apple', url: null }, error: null })
  })

  it('未連携時にApple連携ボタンを表示しOAuth連携を開始する', async () => {
    const user = userEvent.setup()
    renderLoginMethods()

    expect(await screen.findByText('メールアドレスとパスワード')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apple を連携' }))

    await waitFor(() => {
      expect(mocks.linkIdentity).toHaveBeenCalledWith({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=%2Fsettings%2Faccount%3FloginLinked%3D1`,
        },
      })
    })
  })

  it('Expo iOS WebViewではネイティブへ連携メッセージを送る', async () => {
    const user = userEvent.setup()
    const postMessage = vi.fn()
    Object.defineProperty(window, 'ReactNativeWebView', {
      configurable: true,
      value: { postMessage },
    })
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    })

    renderLoginMethods()
    await user.click(await screen.findByRole('button', { name: 'Apple を連携' }))

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'link-apple-identity' }))
    expect(mocks.linkIdentity).not.toHaveBeenCalled()

    delete (window as typeof window & { ReactNativeWebView?: unknown }).ReactNativeWebView
  })

  it('Apple連携済みなら解除できる', async () => {
    const user = userEvent.setup()
    mocks.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          {
            identity_id: 'email-1',
            provider: 'email',
            id: 'email-1',
            user_id: 'u1',
            identity_data: { email: 'taro@example.com' },
          },
          {
            identity_id: 'apple-1',
            provider: 'apple',
            id: 'apple-1',
            user_id: 'u1',
            identity_data: { email: 'relay@privaterelay.appleid.com' },
          },
        ],
      },
      error: null,
    })
    mocks.unlinkIdentity.mockResolvedValue({ data: {}, error: null })

    renderLoginMethods()
    await user.click(await screen.findByRole('button', { name: '解除' }))
    await user.click(screen.getByRole('button', { name: '解除する' }))

    await waitFor(() => {
      expect(mocks.unlinkIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ identity_id: 'apple-1', provider: 'apple' }),
      )
    })
    expect(await screen.findByText('Apple 連携を解除しました')).toBeInTheDocument()
  })
})
