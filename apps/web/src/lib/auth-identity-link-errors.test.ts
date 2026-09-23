// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  classifyLoginLinkError,
  formatLoginLinkErrorMessage,
  parseLoginLinkContext,
} from './auth-identity-link-errors'

describe('auth-identity-link-errors', () => {
  it('identity_already_exists を分類する', () => {
    expect(classifyLoginLinkError('identity_already_exists', null)).toBe('identity_already_exists')
    expect(classifyLoginLinkError(null, 'Identity is already linked to another user')).toBe(
      'identity_already_exists',
    )
  })

  it('設定画面向けメッセージを組み立てる', () => {
    expect(formatLoginLinkErrorMessage('identity_already_exists', 'apple')).toContain(
      '別の Cairn アカウントに連携済み',
    )
    expect(formatLoginLinkErrorMessage('identity_already_exists', 'google')).toContain('Google')
  })

  it('next からログイン方法連携フローを判定する', () => {
    expect(parseLoginLinkContext('/settings/account?loginLinked=apple')).toEqual({
      isLoginLinkFlow: true,
      provider: 'apple',
    })
    expect(parseLoginLinkContext('/projects')).toEqual({
      isLoginLinkFlow: false,
      provider: null,
    })
  })
})
