// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OidcGrantDto } from '@/app/api/oidc/grants/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import {
  CAIRN_LOGIN_GRANTS_QUERY_KEY,
  useCairnLoginGrants,
  useRevokeCairnLoginGrant,
} from './use-cairn-login-grants'

vi.mock('@/lib/fetch-with-auth')

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

function grant(clientId: string, clientName: string): OidcGrantDto {
  return { clientId, clientName, scope: 'openid', grantedAt: '2026-11-03T00:00:00.000Z' }
}

describe('useCairnLoginGrants', () => {
  beforeEach(() => vi.clearAllMocks())

  it('許可したアプリの一覧を返す', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(Response.json([grant('a', 'App A')]))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCairnLoginGrants(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/oidc/grants')
    expect(result.current.data?.map((item) => item.clientName)).toEqual(['App A'])
  })

  it('一覧を取得できなければ翻訳キーのエラーにする', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 500 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCairnLoginGrants(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Could not load apps that use Sign in with Cairn')
  })
})

describe('useRevokeCairnLoginGrant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('取り消したアプリを一覧のキャッシュから外す', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 204 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(CAIRN_LOGIN_GRANTS_QUERY_KEY, [grant('a', 'App A'), grant('b', 'App B')])

    const { result } = renderHook(() => useRevokeCairnLoginGrant(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('a')
    })

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/oidc/grants/a', { method: 'DELETE' })
    expect(queryClient.getQueryData<OidcGrantDto[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY)?.map((item) => item.clientId)).toEqual(['b'])
  })

  it('取り消しに失敗したらキャッシュを変えずに翻訳キーのエラーにする', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 500 }))
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(CAIRN_LOGIN_GRANTS_QUERY_KEY, [grant('a', 'App A')])

    const { result } = renderHook(() => useRevokeCairnLoginGrant(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toThrow('Could not revoke access for this app')
    })

    expect(queryClient.getQueryData<OidcGrantDto[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY)?.map((item) => item.clientId)).toEqual(['a'])
  })
})
