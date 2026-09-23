// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { isAppleAuthenticationCancelled } from './apple-auth'

export const LINK_APPLE_IDENTITY_MESSAGE_TYPE = 'link-apple-identity' as const
export const APPLE_IDENTITY_LINKED_EVENT = 'cairn:apple-identity-linked' as const

export type NativeAppleIdentityLinkResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; message: string }

export function buildAppleIdentityLinkedScript(result: NativeAppleIdentityLinkResult): string {
  return (
    `window.dispatchEvent(new CustomEvent('${APPLE_IDENTITY_LINKED_EVENT}', {` +
    ` detail: ${JSON.stringify(result)} })); true;`
  )
}

function mapLinkError(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  if (
    code === 'identity_already_exists' ||
    /already.*(linked|exists|registered)/i.test(message)
  ) {
    return 'この Apple ID は別のアカウントに連携済みです。別の Apple ID を使うか、先にそちらの連携を解除してください。'
  }
  if (/manual.?linking/i.test(message) || /linking.?not.?enabled/i.test(message)) {
    return 'Apple 連携は現在この環境で無効です。しばらくしてから再度お試しください。'
  }
  return 'Apple との連携に失敗しました。しばらくしてからもう一度お試しください。'
}

/** ログイン済みセッションに Apple identity を追加する（設定 WebView からの連携用）。 */
export async function linkAppleIdentity(): Promise<NativeAppleIdentityLinkResult> {
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
    return { ok: false, message: mapLinkError(error) }
  }

  return { ok: true }
}
