// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { isAppleAuthenticationCancelled } from './apple-auth'
import { resolveOAuthScheme } from './oauth-scheme'

export const LINK_APPLE_IDENTITY_MESSAGE_TYPE = 'link-apple-identity' as const
export const LINK_GOOGLE_IDENTITY_MESSAGE_TYPE = 'link-google-identity' as const
export const APPLE_IDENTITY_LINKED_EVENT = 'cairn:apple-identity-linked' as const
export const GOOGLE_IDENTITY_LINKED_EVENT = 'cairn:google-identity-linked' as const

export type NativeOAuthIdentityLinkResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; message: string }

/** @deprecated use NativeOAuthIdentityLinkResult */
export type NativeAppleIdentityLinkResult = NativeOAuthIdentityLinkResult

type AuthErrorLike = {
  message?: string | undefined
  code?: string | undefined
} | null

function mapLinkError(providerLabel: string, error: AuthErrorLike): string {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  if (
    code === 'identity_already_exists' ||
    /already.*(linked|exists|registered)/i.test(message)
  ) {
    return `この ${providerLabel} アカウントは別の Cairn アカウントに連携済みです。別のアカウントを使うか、先にそちらの連携を解除してください。`
  }
  if (/manual.?linking/i.test(message) || /linking.?not.?enabled/i.test(message)) {
    return `${providerLabel} 連携は現在この環境で無効です。しばらくしてから再度お試しください。`
  }
  return `${providerLabel} との連携に失敗しました。しばらくしてからもう一度お試しください。`
}

export function buildAppleIdentityLinkedScript(result: NativeOAuthIdentityLinkResult): string {
  return (
    `window.dispatchEvent(new CustomEvent('${APPLE_IDENTITY_LINKED_EVENT}', {` +
    ` detail: ${JSON.stringify(result)} })); true;`
  )
}

export function buildGoogleIdentityLinkedScript(result: NativeOAuthIdentityLinkResult): string {
  return (
    `window.dispatchEvent(new CustomEvent('${GOOGLE_IDENTITY_LINKED_EVENT}', {` +
    ` detail: ${JSON.stringify(result)} })); true;`
  )
}

/** ログイン済みセッションに Apple identity を追加する（設定 WebView からの連携用）。 */
export async function linkAppleIdentity(): Promise<NativeOAuthIdentityLinkResult> {
  if (Platform.OS !== 'ios') {
    return {
      ok: false,
      message: 'Apple 連携は iOS でのみ利用できます。',
    }
  }

  const rawNonce = Crypto.randomUUID()
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce, {
    encoding: Crypto.CryptoEncoding.HEX,
  })

  let credential: AppleAuthentication.AppleAuthenticationCredential
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    })
  } catch (error) {
    if (isAppleAuthenticationCancelled(error)) {
      return { ok: false, cancelled: true, message: 'Apple 連携をキャンセルしました' }
    }
    throw error
  }

  if (!credential.identityToken) {
    return { ok: false, message: 'Apple認証情報を取得できませんでした' }
  }

  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
    ...(credential.authorizationCode ? { access_token: credential.authorizationCode } : {}),
  })

  if (error) {
    return { ok: false, message: mapLinkError('Apple', error) }
  }

  return { ok: true }
}

/** ログイン済みセッションに Google identity を追加する（設定 WebView からの連携用）。 */
export async function linkGoogleIdentity(): Promise<NativeOAuthIdentityLinkResult> {
  const scheme = resolveOAuthScheme(Application.applicationId)
  const redirectTo = Linking.createURL('auth/callback', { scheme })

  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) {
    return { ok: false, message: mapLinkError('Google', error) }
  }
  if (!data.url) {
    return { ok: false, message: 'Google 連携の認可 URL を取得できませんでした' }
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type !== 'success') {
    return { ok: false, cancelled: true, message: 'Google 連携をキャンセルしました' }
  }

  const { queryParams } = Linking.parse(result.url)
  const code = queryParams?.['code']
  if (typeof code !== 'string') {
    return { ok: false, message: '認可コードを取得できませんでした' }
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return { ok: false, message: mapLinkError('Google', exchangeError) }
  }

  return { ok: true }
}
