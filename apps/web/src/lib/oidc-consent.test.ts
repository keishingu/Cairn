// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { describeOidcScopes, parseAuthorizationId } from './oidc-consent'

describe('parseAuthorizationId', () => {
  it('Supabase が発行する英数字の authorization_id を受け付ける', () => {
    // 実際にローカルの Supabase Auth（OAuth 2.1 Server）が同意画面へ渡した値の形
    expect(parseAuthorizationId('4oyac733lgevzscx7jvbi2ufm3nvz2u4')).toBe('4oyac733lgevzscx7jvbi2ufm3nvz2u4')
  })

  it('URL やパスに混ぜると危ない文字・長すぎる値・配列・未指定は null にする', () => {
    expect(parseAuthorizationId('abc/../x')).toBeNull()
    expect(parseAuthorizationId('abc?next=https://evil.example')).toBeNull()
    expect(parseAuthorizationId('a'.repeat(129))).toBeNull()
    expect(parseAuthorizationId('')).toBeNull()
    expect(parseAuthorizationId(['4oyac733lgevzscx7jvbi2ufm3nvz2u4'])).toBeNull()
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
