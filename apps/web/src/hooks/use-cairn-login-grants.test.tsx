// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthGrant } from '@supabase/supabase-js'

const { mockOauth } = vi.hoisted(() => ({
  mockOauth: { listGrants: vi.fn(), revokeGrant: vi.fn() },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { oauth: mockOauth } }),
}))

import {
  CAIRN_LOGIN_GRANTS_QUERY_KEY,
  useCairnLoginGrants,
  useRevokeCairnLoginGrant,
} from './use-cairn-login-grants'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

function grant(clientId: string, name: string): OAuthGrant {
  return {
    client: { id: clientId, name, uri: '', logo_uri: '' },
    scopes: ['openid'],
    granted_at: '2026-11-03T00:00:00Z',
  }
}

describe('useCairnLoginGrants', () => {
  beforeEach(() => vi.clearAllMocks())

  it('許可したアプリの一覧を返す', async () => {
    mockOauth.listGrants.mockResolvedValue({ data: [grant('a', 'App A')], error: null })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCairnLoginGrants(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((item) => item.client.name)).toEqual(['App A'])
  })

  it('一覧を取得できなければ翻訳キーのエラーにする', async () => {
    mockOauth.listGrants.mockResolvedValue({ data: null, error: { message: 'oauth server disabled' } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCairnLoginGrants(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Could not load apps that use Sign in with Cairn')
  })
})

describe('useRevokeCairnLoginGrant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('取り消したアプリを一覧のキャッシュから外す', async () => {
    mockOauth.revokeGrant.mockResolvedValue({ data: {}, error: null })
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(CAIRN_LOGIN_GRANTS_QUERY_KEY, [grant('a', 'App A'), grant('b', 'App B')])

    const { result } = renderHook(() => useRevokeCairnLoginGrant(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('a')
    })

    expect(mockOauth.revokeGrant).toHaveBeenCalledWith({ clientId: 'a' })
    expect(queryClient.getQueryData<OAuthGrant[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY)?.map((item) => item.client.id)).toEqual(['b'])
  })

  it('取り消しに失敗したらキャッシュを変えずに翻訳キーのエラーにする', async () => {
    mockOauth.revokeGrant.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(CAIRN_LOGIN_GRANTS_QUERY_KEY, [grant('a', 'App A')])

    const { result } = renderHook(() => useRevokeCairnLoginGrant(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toThrow('Could not revoke access for this app')
    })

    expect(queryClient.getQueryData<OAuthGrant[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY)?.map((item) => item.client.id)).toEqual(['a'])
  })
})
