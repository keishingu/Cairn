// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OidcGrantDto } from '@/app/api/oidc/grants/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

// 「Cairn でログイン」（OIDC）で利用者が許可した外部アプリ（docs/oidc-design.md §8）。
// エラーの message は翻訳キー（英語の UI 文）で、表示側が t() で訳す
export const CAIRN_LOGIN_GRANTS_QUERY_KEY = ['cairn-login-grants'] as const

export function useCairnLoginGrants() {
  return useQuery({
    queryKey: CAIRN_LOGIN_GRANTS_QUERY_KEY,
    queryFn: async (): Promise<OidcGrantDto[]> => {
      const response = await fetchWithAuth('/api/oidc/grants')
      if (!response.ok) throw new Error('Could not load apps that use Sign in with Cairn')
      return response.json()
    },
  })
}

export function useRevokeCairnLoginGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (clientId: string): Promise<void> => {
      const response = await fetchWithAuth(`/api/oidc/grants/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Could not revoke access for this app')
    },
    onSuccess: (_data, clientId) => {
      queryClient.setQueryData<OidcGrantDto[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY, (current) =>
        current?.filter((grant) => grant.clientId !== clientId),
      )
    },
  })
}
