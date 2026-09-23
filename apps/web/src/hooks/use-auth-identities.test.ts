// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAuthIdentities,
  useLinkAppleIdentity,
  useUnlinkAppleIdentity,
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
    const { result } = renderHook(() => useLinkAppleIdentity(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=%2Fsettings%2Faccount%3FloginLinked%3D1`,
      },
    })
  })

  it('既に別アカウントへ紐付いているApple IDは日本語エラーにする', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: null,
      error: { message: 'Identity is already linked', code: 'identity_already_exists' },
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useLinkAppleIdentity(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(/別のアカウントに連携済み/)
    })
  })

  it('Apple連携解除を呼び出す', async () => {
    mocks.unlinkIdentity.mockResolvedValue({ data: {}, error: null })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnlinkAppleIdentity(), { wrapper })
    const apple = {
      identity_id: '2',
      provider: 'apple',
      id: '2',
      user_id: 'u1',
    }

    await act(async () => {
      await result.current.mutateAsync(apple)
    })

    expect(mocks.unlinkIdentity).toHaveBeenCalledWith(apple)
  })

  it('providerLabelは主要プロバイダを日本語化する', () => {
    expect(providerLabel('email')).toBe('メールアドレスとパスワード')
    expect(providerLabel('apple')).toBe('Apple')
    expect(providerLabel('google')).toBe('Google')
  })
})
