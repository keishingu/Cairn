// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach, afterEach } from 'vitest'

const ORIGINAL_KEY = process.env['CALENDAR_TOKEN_ENCRYPTION_KEY']

describe('token-crypto', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env['CALENDAR_TOKEN_ENCRYPTION_KEY']
    } else {
      process.env['CALENDAR_TOKEN_ENCRYPTION_KEY'] = ORIGINAL_KEY
    }
  })

  describe('CALENDAR_TOKEN_ENCRYPTION_KEY が正しく設定されている場合', () => {
    beforeEach(() => {
      process.env['CALENDAR_TOKEN_ENCRYPTION_KEY'] = 'a'.repeat(64)
    })

    test('暗号化したトークンを復号すると元の文字列に戻る', async () => {
      const { encryptToken, decryptToken } = await import('./token-crypto')
      const plain = 'ya29.a0AfH6SMC...example-access-token'
      const encrypted = encryptToken(plain)
      expect(decryptToken(encrypted)).toBe(plain)
    })

    test('暗号化結果は iv:authTag:encrypted の3要素のhex文字列になる', async () => {
      const { encryptToken } = await import('./token-crypto')
      const encrypted = encryptToken('some-token')
      const parts = encrypted.split(':')
      expect(parts).toHaveLength(3)
      for (const part of parts) {
        expect(part).toMatch(/^[0-9a-f]+$/)
      }
    })

    test('同じ平文でも暗号化のたびに異なる結果になる（ivがランダムなため）', async () => {
      const { encryptToken } = await import('./token-crypto')
      const a = encryptToken('same-token')
      const b = encryptToken('same-token')
      expect(a).not.toBe(b)
    })

    test('不正な形式の文字列を復号しようとするとエラーになる', async () => {
      const { decryptToken } = await import('./token-crypto')
      expect(() => decryptToken('invalid-format')).toThrow('Invalid encrypted token format')
    })
  })

  describe('CALENDAR_TOKEN_ENCRYPTION_KEY が未設定の場合', () => {
    beforeEach(() => {
      delete process.env['CALENDAR_TOKEN_ENCRYPTION_KEY']
    })

    test('encryptTokenを呼ぶとエラーになる', async () => {
      const { encryptToken } = await import('./token-crypto')
      expect(() => encryptToken('token')).toThrow('CALENDAR_TOKEN_ENCRYPTION_KEY must be a 64-character hex string')
    })
  })

  describe('CALENDAR_TOKEN_ENCRYPTION_KEY の長さが不正な場合', () => {
    beforeEach(() => {
      process.env['CALENDAR_TOKEN_ENCRYPTION_KEY'] = 'short'
    })

    test('encryptTokenを呼ぶとエラーになる', async () => {
      const { encryptToken } = await import('./token-crypto')
      expect(() => encryptToken('token')).toThrow('CALENDAR_TOKEN_ENCRYPTION_KEY must be a 64-character hex string')
    })
  })
})
