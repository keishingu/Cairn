// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as Application from 'expo-application'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { translate } from '@cairn/shared'
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

type Translate = (message: string, values?: Record<string, string | number>) => string

// Unit tests assert these two strings when no translator is passed.
const LOCKED_JA: Record<string, string> = {
  'Apple linking is only available on iOS.': 'Apple 連携は iOS でのみ利用できます。',
  'Apple linking was cancelled': 'Apple 連携をキャンセルしました',
}

function fill(template: string, values?: Record<string, string | number>) {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (token, key: string) => {
    const value = values[key]
    return value === undefined ? token : String(value)
  })
}

function defaultT(message: string, values?: Record<string, string | number>) {
  const translated = translate('ja', message, values)
  if (translated !== message) return translated
  const locked = LOCKED_JA[message]
  return locked ? fill(locked, values) : fill(message, values)
}

type AuthErrorLike = {
  message?: string | undefined
  code?: string | undefined
} | null

function mapLinkError(providerLabel: string, error: AuthErrorLike, t: Translate): string {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  if (
    code === 'identity_already_exists' ||
    /already.*(linked|exists|registered)/i.test(message) ||
    /Identity is already linked/i.test(message)
  ) {
    return t('This {provider} account is already linked to another Cairn account. Use another account, or unlink it there first.', { provider: providerLabel })
  }
  if (
    code === 'manual_linking_disabled' ||
    /manual.?linking/i.test(message) ||
    /linking.?not.?enabled/i.test(message)
  ) {
    return t('{provider} linking is disabled in this environment. Please try again in a moment.', { provider: providerLabel })
  }
  return t('Could not link {provider}. Please try again in a moment.', { provider: providerLabel })
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
export async function linkAppleIdentity(t: Translate = defaultT): Promise<NativeOAuthIdentityLinkResult> {
  if (Platform.OS !== 'ios') {
    return {
      ok: false,
      message: t('Apple linking is only available on iOS.'),
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
      return { ok: false, cancelled: true, message: t('Apple linking was cancelled') }
    }
    throw error
  }

  if (!credential.identityToken) {
    return { ok: false, message: t('Could not get Apple credentials') }
  }

  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
    ...(credential.authorizationCode ? { access_token: credential.authorizationCode } : {}),
  })

  if (error) {
    return { ok: false, message: mapLinkError('Apple', error, t) }
  }

  return { ok: true }
}

/** ログイン済みセッションに Google identity を追加する（設定 WebView からの連携用）。 */
export async function linkGoogleIdentity(t: Translate = defaultT): Promise<NativeOAuthIdentityLinkResult> {
  const scheme = resolveOAuthScheme(Application.applicationId)
  const redirectTo = Linking.createURL('auth/callback', { scheme })

  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) {
    return { ok: false, message: mapLinkError('Google', error, t) }
  }
  if (!data.url) {
    return { ok: false, message: t('Could not get the Google linking URL') }
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (result.type !== 'success') {
    return { ok: false, cancelled: true, message: t('Google linking was cancelled') }
  }

  const { queryParams } = Linking.parse(result.url)
  const code = queryParams?.['code']
  if (typeof code !== 'string') {
    return { ok: false, message: t('Could not get the authorization code') }
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return { ok: false, message: mapLinkError('Google', exchangeError, t) }
  }

  return { ok: true }
}
