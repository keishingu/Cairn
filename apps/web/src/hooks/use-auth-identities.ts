// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UserIdentity } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export const AUTH_IDENTITIES_QUERY_KEY = ['auth-identities'] as const

export type LinkableOAuthProvider = 'apple' | 'google'
export type AuthIdentityProvider = 'email' | LinkableOAuthProvider | string

type AuthErrorLike = {
  message?: string | undefined
  code?: string | undefined
} | null

export function providerLabel(provider: string): string {
  switch (provider) {
    case 'email':
      return 'メールアドレスとパスワード'
    case 'apple':
      return 'Apple'
    case 'google':
      return 'Google'
    default:
      return provider
  }
}

function mapLinkError(provider: LinkableOAuthProvider, error: AuthErrorLike): Error {
  const label = providerLabel(provider)
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  if (
    code === 'identity_already_exists' ||
    /already.*(linked|exists|registered)/i.test(message)
  ) {
    return new Error(
      `この ${label} アカウントは別の Cairn アカウントに連携済みです。別のアカウントを使うか、先にそちらの連携を解除してください。`,
    )
  }
  if (/manual.?linking/i.test(message) || /linking.?not.?enabled/i.test(message)) {
    return new Error(`${label} 連携は現在この環境で無効です。しばらくしてから再度お試しください。`)
  }
  return new Error(`${label} との連携を開始できませんでした。しばらくしてからもう一度お試しください。`)
}

function mapUnlinkError(provider: LinkableOAuthProvider, error: AuthErrorLike): Error {
  const label = providerLabel(provider)
  const message = error?.message ?? ''
  if (/at least 2|least two|単一|only one/i.test(message)) {
    return new Error('最後のログイン方法は解除できません。別のログイン方法を追加してから解除してください。')
  }
  return new Error(`${label} 連携の解除に失敗しました。しばらくしてからもう一度お試しください。`)
}

export function useAuthIdentities() {
  return useQuery({
    queryKey: AUTH_IDENTITIES_QUERY_KEY,
    queryFn: async (): Promise<UserIdentity[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getUserIdentities()
      if (error) throw new Error('ログイン方法の取得に失敗しました')
      return data.identities
    },
    staleTime: 30_000,
  })
}

export function useLinkOAuthIdentity(provider: LinkableOAuthProvider) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<'redirecting' | 'linked'> => {
      const supabase = createClient()
      const callbackUrl = new URL('/api/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', `/settings/account?loginLinked=${provider}`)

      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: callbackUrl.toString() },
      })
      if (error) throw mapLinkError(provider, error)
      // 成功時はブラウザがプロバイダへ遷移する。戻ってこない場合だけここへ到達する。
      return 'redirecting'
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_IDENTITIES_QUERY_KEY })
    },
  })
}

export function useUnlinkOAuthIdentity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (identity: UserIdentity) => {
      if (identity.provider !== 'apple' && identity.provider !== 'google') {
        throw new Error('このログイン方法はここでは解除できません')
      }
      const supabase = createClient()
      const { error } = await supabase.auth.unlinkIdentity(identity)
      if (error) throw mapUnlinkError(identity.provider, error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_IDENTITIES_QUERY_KEY })
    },
  })
}

/** @deprecated use useLinkOAuthIdentity('apple') */
export function useLinkAppleIdentity() {
  return useLinkOAuthIdentity('apple')
}

/** @deprecated use useUnlinkOAuthIdentity */
export function useUnlinkAppleIdentity() {
  return useUnlinkOAuthIdentity()
}

export function findIdentity(
  identities: UserIdentity[] | undefined,
  provider: AuthIdentityProvider,
): UserIdentity | undefined {
  return identities?.find((identity) => identity.provider === provider)
}
