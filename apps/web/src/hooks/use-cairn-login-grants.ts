// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OAuthGrant } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// 「Cairn でログイン」（OIDC）で利用者が許可した外部アプリ。許可の一覧と取り消しは Supabase Auth の
// OAuth 2.1 Server が持つので、本人のセッションで直接呼ぶ（docs/oidc-design.md §6）。
// エラーの message は翻訳キー（英語の UI 文）で、表示側が t() で訳す
export const CAIRN_LOGIN_GRANTS_QUERY_KEY = ['cairn-login-grants'] as const

export function useCairnLoginGrants() {
  return useQuery({
    queryKey: CAIRN_LOGIN_GRANTS_QUERY_KEY,
    queryFn: async (): Promise<OAuthGrant[]> => {
      const { data, error } = await createClient().auth.oauth.listGrants()
      if (error || !data) throw new Error('Could not load apps that use Sign in with Cairn')
      return data
    },
  })
}

export function useRevokeCairnLoginGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (clientId: string): Promise<void> => {
      const { error } = await createClient().auth.oauth.revokeGrant({ clientId })
      if (error) throw new Error('Could not revoke access for this app')
    },
    onSuccess: (_data, clientId) => {
      queryClient.setQueryData<OAuthGrant[]>(CAIRN_LOGIN_GRANTS_QUERY_KEY, (current) =>
        current?.filter((grant) => grant.client.id !== clientId),
      )
    },
  })
}
