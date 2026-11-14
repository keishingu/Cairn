// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  describeOidcScopes,
  mergeOidcScopes,
  normalizeOidcScope,
  oidcAuthTime,
  oidcScopeCovers,
} from './config'

describe('normalizeOidcScope', () => {
  it('openid を含む対応スコープを決まった順に並べる', () => {
    expect(normalizeOidcScope('email openid')).toBe('openid email')
    expect(normalizeOidcScope('profile  openid email')).toBe('openid profile email')
  })

  it('openid が無いもの・対応していないスコープを含むものは null にする', () => {
    expect(normalizeOidcScope('profile email')).toBeNull()
    expect(normalizeOidcScope('openid phone')).toBeNull()
    expect(normalizeOidcScope('openid offline_access')).toBeNull()
    expect(normalizeOidcScope(null)).toBeNull()
  })
})

describe('oidcScopeCovers / mergeOidcScopes', () => {
  it('許可済みのスコープが要求をすべて含むときだけ true', () => {
    expect(oidcScopeCovers('openid profile email', 'openid email')).toBe(true)
    expect(oidcScopeCovers('openid', 'openid email')).toBe(false)
  })

  it('二つの許可を合わせて決まった順に並べる', () => {
    expect(mergeOidcScopes('openid email', 'openid profile')).toBe('openid profile email')
  })
})

describe('describeOidcScopes', () => {
  it('スコープを利用者向けの説明にする', () => {
    expect(describeOidcScopes('openid profile email')).toEqual([
      'Your Cairn account ID',
      'Your name',
      'Your email address',
    ])
  })
})

describe('oidcAuthTime', () => {
  it('最後にログインした時刻を返す', () => {
    expect(oidcAuthTime({ last_sign_in_at: '2026-11-03T01:02:03Z' }).toISOString()).toBe('2026-11-03T01:02:03.000Z')
  })

  it('分からなければ代わりの時刻を入れずにエラーにする', () => {
    expect(() => oidcAuthTime({})).toThrow('last_sign_in_at is missing')
  })
})
