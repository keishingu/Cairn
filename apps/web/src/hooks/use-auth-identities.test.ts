// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAuthIdentities,
  useLinkOAuthIdentity,
  useUnlinkOAuthIdentity,
  findIdentity,
  providerLabel,
} from './use-auth-identities'

const mocks = vi.hoisted(() => ({
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
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

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

describe('useAuthIdentities', () => {
  beforeEach(() => {
    mocks.getUserIdentities.mockReset()
    mocks.linkIdentity.mockReset()
    mocks.unlinkIdentity.mockReset()
  })

  it('ログイン方法一覧を取得する', async () => {
    mocks.getUserIdentities.mockResolvedValue({
      data: {
        identities: [
          { identity_id: '1', provider: 'email', id: '1', user_id: 'u1' },
          { identity_id: '2', provider: 'apple', id: '2', user_id: 'u1' },
        ],
      },
      error: null,
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAuthIdentities(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(findIdentity(result.current.data, 'apple')?.identity_id).toBe('2')
  })

  it('Apple連携は設定画面へ戻るコールバック付きで開始する', async () => {
    mocks.linkIdentity.mockResolvedValue({ data: { provider: 'apple', url: 'https://apple' }, error: null })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useLinkOAuthIdentity('apple'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=%2Fsettings%2Faccount%3FloginLinked%3Dapple`,
      },
    })
  })

  it('Google連携は設定画面へ戻るコールバック付きで開始する', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { provider: 'google', url: 'https://google' },
      error: null,
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useLinkOAuthIdentity('google'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=%2Fsettings%2Faccount%3FloginLinked%3Dgoogle`,
      },
    })
  })

  it('既に別アカウントへ紐付いているIDは日本語エラーにする', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: null,
      error: { message: 'Identity is already linked', code: 'identity_already_exists' },
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useLinkOAuthIdentity('apple'), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(/別の Cairn アカウントに連携済み/)
    })
  })

  it('OAuth連携解除を呼び出す', async () => {
    mocks.unlinkIdentity.mockResolvedValue({ data: {}, error: null })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnlinkOAuthIdentity(), { wrapper })
    const google = {
      identity_id: '3',
      provider: 'google' as const,
      id: '3',
      user_id: 'u1',
    }

    await act(async () => {
      await result.current.mutateAsync(google)
    })

    expect(mocks.unlinkIdentity).toHaveBeenCalledWith(google)
  })

  it('providerLabelは主要プロバイダを日本語化する', () => {
    expect(providerLabel('email')).toBe('メールアドレスとパスワード')
    expect(providerLabel('apple')).toBe('Apple')
    expect(providerLabel('google')).toBe('Google')
  })
})
