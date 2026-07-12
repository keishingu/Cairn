// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessToken, __resetJwksCacheForTest } from './auth-jwt'

type AuthLike = { getClaims: ReturnType<typeof vi.fn> }

function makeAuth(getClaims: ReturnType<typeof vi.fn>): AuthLike {
  return { getClaims }
}

describe('verifyAccessToken', () => {
  beforeEach(() => {
    __resetJwksCacheForTest()
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('検証成功時は claims.sub を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) }))
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims) as never, 'tok')

    expect(result).toBe('user-9')
    expect(getClaims).toHaveBeenCalledWith('tok', undefined)
  })

  it('error 時は null を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) }))
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: { message: 'bad' } })

    expect(await verifyAccessToken(makeAuth(getClaims) as never, 'tok')).toBeNull()
  })

  it('非対称鍵（JWKS あり）では jwks を getClaims に渡す', async () => {
    const keys = [{ kid: 'abc', kty: 'EC', key_ops: ['verify'] }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys }) }))
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, 'tok')

    expect(getClaims).toHaveBeenCalledWith('tok', { jwks: { keys } })
  })

  it('JWKS はキャッシュされ、2回目はネットワークを叩かない', async () => {
    const keys = [{ kid: 'abc', kty: 'EC', key_ops: ['verify'] }]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys }) })
    vi.stubGlobal('fetch', fetchMock)
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, 'tok')
    await verifyAccessToken(makeAuth(getClaims) as never, 'tok')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('JWKS 取得失敗でもフェイルクローズせず getClaims の検証に委ねる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims) as never, 'tok')

    expect(result).toBe('user-9')
    // JWKS が無いので keys は渡さない（getClaims 側が HS256 検知で getUser にフォールバック）
    expect(getClaims).toHaveBeenCalledWith('tok', undefined)
  })
})
