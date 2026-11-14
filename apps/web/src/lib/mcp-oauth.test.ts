// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createOAuthSecret,
  getOAuthIssuer,
  hashOAuthValue,
  isValidRedirectUri,
  OAUTH_ACCESS_TOKEN_PREFIX,
  parseOAuthScope,
  verifyPkceS256,
} from './mcp-oauth'

const originalAppUrl = process.env['APP_URL']

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env['APP_URL']
  else process.env['APP_URL'] = originalAppUrl
})

describe('MCP OAuth', () => {
  it('公開issuerはAPP_URLを優先し、未設定時だけリクエスト元を使う', () => {
    process.env['APP_URL'] = 'https://develop.oss-cairn.com/'
    expect(getOAuthIssuer(new Request('http://localhost:3000'))).toBe(
      'https://develop.oss-cairn.com',
    )

    delete process.env['APP_URL']
    expect(getOAuthIssuer(new Request('http://localhost:3000'))).toBe('http://localhost:3000')
  })

  it('opaque tokenは十分な乱数を持ち、DB保存用ハッシュだけを別に返す', () => {
    const first = createOAuthSecret(OAUTH_ACCESS_TOKEN_PREFIX)
    const second = createOAuthSecret(OAUTH_ACCESS_TOKEN_PREFIX)

    expect(first.value).toMatch(/^cairn_oauth_at_[A-Za-z0-9_-]{43}$/)
    expect(first.hash).toBe(hashOAuthValue(first.value))
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.hash).not.toContain(first.value)
    expect(second.value).not.toBe(first.value)
  })

  it('write scopeはreadを包含し、未知scopeを拒否する', () => {
    expect(parseOAuthScope('read')).toEqual({ scope: 'read', grantedScope: 'read' })
    expect(parseOAuthScope('write')).toEqual({ scope: 'write', grantedScope: 'read write' })
    expect(parseOAuthScope('read write')).toEqual({ scope: 'write', grantedScope: 'read write' })
    expect(() => parseOAuthScope('admin')).toThrow('Only read and write scopes are supported')
  })

  it('PKCE S256の正しいverifierだけを受け付ける', () => {
    const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
    const challenge = createHash('sha256').update(verifier).digest('base64url')

    expect(verifyPkceS256(verifier, challenge)).toBe(true)
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false)
    expect(verifyPkceS256('short', challenge)).toBe(false)
  })

  it('HTTPSとloopback HTTPだけをredirect URIとして許可する', () => {
    expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isValidRedirectUri('https://claude.com/api/mcp/auth_callback')).toBe(true)
    expect(isValidRedirectUri('http://localhost:6274/oauth/callback')).toBe(true)
    expect(isValidRedirectUri('http://127.0.0.1:6274/oauth/callback')).toBe(true)
    expect(isValidRedirectUri('http://example.com/callback')).toBe(false)
    expect(isValidRedirectUri('https://example.com/callback#fragment')).toBe(false)
    expect(isValidRedirectUri('https://www.cursor.com/agents/mcp/oauth/callback')).toBe(true)
    expect(isValidRedirectUri('http://localhost:8787/callback')).toBe(true)
    expect(isValidRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(false)
  })
})
