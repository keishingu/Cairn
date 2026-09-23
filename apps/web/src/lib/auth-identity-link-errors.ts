// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type LinkableOAuthProvider = 'apple' | 'google'

export type LoginLinkErrorKey =
  | 'identity_already_exists'
  | 'manual_linking_disabled'
  | 'callback'

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

/** Supabase の error_code / error_description から設定画面用の安定キーへ落とす。 */
export function classifyLoginLinkError(
  errorCode: string | null | undefined,
  errorDescription: string | null | undefined,
): LoginLinkErrorKey {
  const code = errorCode ?? ''
  const description = errorDescription ?? ''
  if (
    code === 'identity_already_exists' ||
    /already.*(linked|exists|registered)/i.test(description) ||
    /Identity is already linked/i.test(description)
  ) {
    return 'identity_already_exists'
  }
  if (
    code === 'manual_linking_disabled' ||
    /manual.?linking/i.test(description) ||
    /linking.?not.?enabled/i.test(description)
  ) {
    return 'manual_linking_disabled'
  }
  return 'callback'
}

export function formatLoginLinkErrorMessage(
  key: LoginLinkErrorKey,
  provider: string | null | undefined,
): string {
  const label = provider ? providerLabel(provider) : '外部アカウント'
  switch (key) {
    case 'identity_already_exists':
      return `この ${label} アカウントは別の Cairn アカウントに連携済みです。別のアカウントを使うか、先にそちらの連携を解除してください。`
    case 'manual_linking_disabled':
      return `${label} 連携は現在この環境で無効です。しばらくしてから再度お試しください。`
    default:
      return `${label} との連携に失敗しました。しばらくしてからもう一度お試しください。`
  }
}

export function parseLoginLinkContext(safeNextPath: string | null): {
  isLoginLinkFlow: boolean
  provider: LinkableOAuthProvider | null
} {
  if (!safeNextPath?.startsWith('/settings/account')) {
    return { isLoginLinkFlow: false, provider: null }
  }
  try {
    const url = new URL(safeNextPath, 'https://cairn.local')
    const linked = url.searchParams.get('loginLinked')
    // 通常ログインの next=/settings/account とは区別する。loginLinked があるときだけ連携フロー。
    const provider = linked === 'apple' || linked === 'google' ? linked : null
    return { isLoginLinkFlow: provider !== null, provider }
  } catch {
    return { isLoginLinkFlow: false, provider: null }
  }
}
