// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPLE_IDENTITY_LINKED_EVENT,
  LINK_APPLE_IDENTITY_MESSAGE_TYPE,
  buildAppleIdentityLinkedScript,
  linkAppleIdentity,
} from './apple-identity-bridge'

const mocks = vi.hoisted(() => ({
  signInAsync: vi.fn(),
  digestStringAsync: vi.fn(),
  linkIdentity: vi.fn(),
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

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      linkIdentity: mocks.linkIdentity,
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
    mocks.platformOS = 'ios'
    mocks.digestStringAsync.mockResolvedValue('hashed-nonce')
  })

  it('メッセージ種別と結果スクリプトを組み立てる', () => {
    expect(LINK_APPLE_IDENTITY_MESSAGE_TYPE).toBe('link-apple-identity')
    expect(buildAppleIdentityLinkedScript({ ok: true })).toContain(APPLE_IDENTITY_LINKED_EVENT)
    expect(buildAppleIdentityLinkedScript({ ok: true })).toContain('"ok":true')
  })

  it('iOSでApple ID tokenを現在のユーザーへ連携する', async () => {
    mocks.signInAsync.mockResolvedValue({
      identityToken: 'id-token',
      authorizationCode: 'auth-code',
    })
    mocks.linkIdentity.mockResolvedValue({ data: {}, error: null })

    await expect(linkAppleIdentity()).resolves.toEqual({ ok: true })

    expect(mocks.signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce' }),
    )
    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'id-token',
      nonce: 'raw-nonce',
      access_token: 'auth-code',
    })
  })

  it('キャンセルはcancelledとして返す', async () => {
    mocks.signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(linkAppleIdentity()).resolves.toEqual({
      ok: false,
      cancelled: true,
      message: 'Apple 連携をキャンセルしました',
    })
  })

  it('Androidでは連携不可を返す', async () => {
    mocks.platformOS = 'android'
    await expect(linkAppleIdentity()).resolves.toEqual({
      ok: false,
      message: 'Apple 連携は iOS でのみ利用できます。',
    })
  })
})
