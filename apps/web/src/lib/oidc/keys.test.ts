// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'
import { getOidcPublicJwks, OidcConfigError, signOidcIdToken } from './keys'

function privateJwk() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return { ...privateKey.export({ format: 'jwk' }), kid: randomUUID() }
}

describe('OIDC の署名鍵', () => {
  const original = process.env['OIDC_SIGNING_KEYS']
  afterEach(() => {
    if (original === undefined) delete process.env['OIDC_SIGNING_KEYS']
    else process.env['OIDC_SIGNING_KEYS'] = original
  })

  it('先頭の鍵で署名し、公開鍵（JWKS）で検証できる', async () => {
    const current = privateJwk()
    const previous = privateJwk()
    process.env['OIDC_SIGNING_KEYS'] = JSON.stringify([current, previous])

    const token = await signOidcIdToken(
      { name: 'Alice' },
      { issuer: 'https://cairn.test/oidc', audience: 'client-1', subject: 'user-1', expiresInSeconds: 300 },
    )
    const jwks = getOidcPublicJwks()
    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: 'https://cairn.test/oidc',
      audience: 'client-1',
      algorithms: ['ES256'],
    })

    expect(protectedHeader.kid).toBe(current.kid)
    expect(payload.sub).toBe('user-1')
    expect(payload['name']).toBe('Alice')
    expect(jwks.keys.map((key) => key.kid)).toEqual([current.kid, previous.kid])
  })

  it('公開鍵には秘密の値（d）を含めない', () => {
    process.env['OIDC_SIGNING_KEYS'] = JSON.stringify([privateJwk()])

    expect(getOidcPublicJwks().keys.every((key) => !('d' in key))).toBe(true)
  })

  it('鍵が未設定・不正なら代わりの鍵を使わずにエラーにする', () => {
    delete process.env['OIDC_SIGNING_KEYS']
    expect(() => getOidcPublicJwks()).toThrow(OidcConfigError)

    process.env['OIDC_SIGNING_KEYS'] = JSON.stringify([{ kty: 'RSA', kid: 'x' }])
    expect(() => getOidcPublicJwks()).toThrow('ES256')
  })
})
