// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPLE_IDENTITY_LINKED_EVENT,
  GOOGLE_IDENTITY_LINKED_EVENT,
  LINK_APPLE_IDENTITY_MESSAGE_TYPE,
  LINK_GOOGLE_IDENTITY_MESSAGE_TYPE,
  buildAppleIdentityLinkedScript,
  buildGoogleIdentityLinkedScript,
  linkAppleIdentity,
  linkGoogleIdentity,
} from './apple-identity-bridge'

const mocks = vi.hoisted(() => ({
  signInAsync: vi.fn(),
  digestStringAsync: vi.fn(),
  linkIdentity: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  createURL: vi.fn(),
  parse: vi.fn(),
  resolveOAuthScheme: vi.fn(),
  platformOS: 'ios' as string,
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.platformOS
    },
  },
}))

vi.mock('expo-apple-authentication', () => ({
  signInAsync: mocks.signInAsync,
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
}))

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce',
  digestStringAsync: mocks.digestStringAsync,
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { HEX: 'hex' },
}))

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: mocks.openAuthSessionAsync,
  maybeCompleteAuthSession: vi.fn(),
}))

vi.mock('expo-linking', () => ({
  createURL: mocks.createURL,
  parse: mocks.parse,
}))

vi.mock('expo-application', () => ({
  applicationId: 'com.oss-cairn.dev',
}))

vi.mock('./oauth-scheme', () => ({
  resolveOAuthScheme: mocks.resolveOAuthScheme,
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      linkIdentity: mocks.linkIdentity,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  },
}))

vi.mock('./apple-auth', () => ({
  isAppleAuthenticationCancelled: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'ERR_REQUEST_CANCELED',
}))

describe('apple-identity-bridge', () => {
  beforeEach(() => {
    mocks.signInAsync.mockReset()
    mocks.digestStringAsync.mockReset()
    mocks.linkIdentity.mockReset()
    mocks.exchangeCodeForSession.mockReset()
    mocks.openAuthSessionAsync.mockReset()
    mocks.createURL.mockReset()
    mocks.parse.mockReset()
    mocks.resolveOAuthScheme.mockReset()
    mocks.platformOS = 'ios'
    mocks.digestStringAsync.mockResolvedValue('hashed-nonce')
    mocks.resolveOAuthScheme.mockReturnValue('cairn-dev')
    mocks.createURL.mockReturnValue('cairn-dev://auth/callback')
  })

  it('メッセージ種別と結果スクリプトを組み立てる', () => {
    expect(LINK_APPLE_IDENTITY_MESSAGE_TYPE).toBe('link-apple-identity')
    expect(LINK_GOOGLE_IDENTITY_MESSAGE_TYPE).toBe('link-google-identity')
    expect(buildAppleIdentityLinkedScript({ ok: true })).toContain(APPLE_IDENTITY_LINKED_EVENT)
    expect(buildGoogleIdentityLinkedScript({ ok: true })).toContain(GOOGLE_IDENTITY_LINKED_EVENT)
  })

  it('iOSでApple ID tokenを現在のユーザーへ連携する', async () => {
    mocks.signInAsync.mockResolvedValue({
      identityToken: 'id-token',
      authorizationCode: 'auth-code',
    })
    mocks.linkIdentity.mockResolvedValue({ data: {}, error: null })

    await expect(linkAppleIdentity()).resolves.toEqual({ ok: true })

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'id-token',
      nonce: 'raw-nonce',
      access_token: 'auth-code',
    })
  })

  it('Google連携はWebBrowserのPKCEフローで完了する', async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o' },
      error: null,
    })
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'cairn-dev://auth/callback?code=abc',
    })
    mocks.parse.mockReturnValue({ queryParams: { code: 'abc' } })
    mocks.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

    await expect(linkGoogleIdentity()).resolves.toEqual({ ok: true })

    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'cairn-dev://auth/callback',
        skipBrowserRedirect: true,
      },
    })
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('キャンセルはcancelledとして返す', async () => {
    mocks.signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(linkAppleIdentity()).resolves.toEqual({
      ok: false,
      cancelled: true,
      message: 'Apple 連携をキャンセルしました',
    })
  })

  it('AndroidではApple連携不可を返す', async () => {
    mocks.platformOS = 'android'
    await expect(linkAppleIdentity()).resolves.toEqual({
      ok: false,
      message: 'Apple 連携は iOS でのみ利用できます。',
    })
  })
})
