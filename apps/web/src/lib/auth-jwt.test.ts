// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessToken, __resetJwksCacheForTest } from './auth-jwt'

type AuthLike = { getClaims: ReturnType<typeof vi.fn>; getSession: ReturnType<typeof vi.fn> | undefined }

function makeAuth(getClaims: ReturnType<typeof vi.fn>, getSession?: ReturnType<typeof vi.fn>): AuthLike {
  return { getClaims, getSession }
}

// 実際に decode 可能な JWT 形状のトークンを組み立てる（署名は検証しないダミーでよい）
function fakeJwt(header: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64url(header)}.${b64url({ sub: 'user-9' })}.sig`
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
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims) as never, 'tok')

    expect(result).toBe('user-9')
  })

  it('error 時は null を返す', async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: { message: 'bad' } })

    expect(await verifyAccessToken(makeAuth(getClaims) as never, 'tok')).toBeNull()
  })

  it('HS256（対称鍵）トークンは JWKS を取得せず getClaims だけを呼ぶ', async () => {
    // 対称鍵運用中（署名鍵移行前）に .well-known/jwks.json への無駄な往復を払わないことの回帰テスト
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const token = fakeJwt({ alg: 'HS256', typ: 'JWT' })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims) as never, token)

    expect(result).toBe('user-9')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getClaims).toHaveBeenCalledWith(token, undefined)
  })

  it('kid の無いトークンは JWKS を取得せず getClaims だけを呼ぶ', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const token = fakeJwt({ alg: 'ES256', typ: 'JWT' })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, token)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非対称鍵（alg + kid あり）では JWKS を取得し getClaims に渡す', async () => {
    const keys = [{ kid: 'abc', kty: 'EC', key_ops: ['verify'] }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys }) }))
    const token = fakeJwt({ alg: 'ES256', kid: 'abc', typ: 'JWT' })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, token)

    expect(getClaims).toHaveBeenCalledWith(token, { jwks: { keys } })
  })

  it('JWKS はキャッシュされ、2回目はネットワークを叩かない', async () => {
    const keys = [{ kid: 'abc', kty: 'EC', key_ops: ['verify'] }]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys }) })
    vi.stubGlobal('fetch', fetchMock)
    const token = fakeJwt({ alg: 'ES256', kid: 'abc', typ: 'JWT' })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, token)
    await verifyAccessToken(makeAuth(getClaims) as never, token)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('JWKS 取得失敗でもフェイルクローズせず getClaims の検証に委ねる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const token = fakeJwt({ alg: 'ES256', kid: 'abc', typ: 'JWT' })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims) as never, token)

    expect(result).toBe('user-9')
    // JWKS が取れなかったので keys は渡さない（getClaims 側が内部フォールバックで検証する）
    expect(getClaims).toHaveBeenCalledWith(token, undefined)
  })

  it('デコード不能なトークンは JWKS を取得せず getClaims にそのまま委ねる', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    await verifyAccessToken(makeAuth(getClaims) as never, 'not-a-jwt')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('token 省略時は getSession でトークンを解決してから検証する', async () => {
    const token = fakeJwt({ alg: 'HS256', typ: 'JWT' })
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: token } }, error: null })
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-9' } }, error: null })

    const result = await verifyAccessToken(makeAuth(getClaims, getSession) as never)

    expect(result).toBe('user-9')
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getClaims).toHaveBeenCalledWith(token, undefined)
  })

  it('token 省略時にセッションが無ければ getClaims を呼ばず null を返す', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    const getClaims = vi.fn()

    const result = await verifyAccessToken(makeAuth(getClaims, getSession) as never)

    expect(result).toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
  })
})
