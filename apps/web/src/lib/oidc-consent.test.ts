// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { describeOidcScopes, parseAuthorizationId } from './oidc-consent'

describe('parseAuthorizationId', () => {
  it('UUID の形の authorization_id だけを受け付ける', () => {
    expect(parseAuthorizationId('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')
  })

  it('UUID でない値・配列・未指定は null にする', () => {
    expect(parseAuthorizationId('not-a-uuid')).toBeNull()
    expect(parseAuthorizationId('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/../x')).toBeNull()
    expect(parseAuthorizationId(['3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'])).toBeNull()
    expect(parseAuthorizationId(undefined)).toBeNull()
  })
})

describe('describeOidcScopes', () => {
  it('Supabase が扱うスコープを利用者向けの説明に変える', () => {
    expect(describeOidcScopes('openid profile email phone')).toEqual([
      'Your Cairn account ID',
      'Your name and profile picture',
      'Your email address',
      'Your phone number',
    ])
  })

  it('知らないスコープは隠さずそのまま出す', () => {
    expect(describeOidcScopes('openid  custom:scope')).toEqual(['Your Cairn account ID', 'custom:scope'])
  })
})
