// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { JWK, SupabaseClient } from '@supabase/supabase-js'

type SupabaseAuth = SupabaseClient['auth']

// JWKS をサーバーレス関数インスタンス内でキャッシュし、非対称署名鍵での
// ローカル検証時に .well-known/jwks.json への往復を warm リクエストで省く（TTL: 10分）。
// getClaims 内蔵の JWKS キャッシュはクライアントインスタンス単位だが、本アプリは
// リクエストごとに新しい supabase クライアントを生成するため跨がない。そこで
// モジュールレベルにキャッシュして getClaims へ明示的に渡す。
const JWKS_TTL_MS = 10 * 60 * 1000
let jwksCache: { keys: JWK[]; expiresAt: number } | null = null

async function getCachedJwks(): Promise<JWK[]> {
  const now = Date.now()
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  if (!url) return jwksCache?.keys ?? []

  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`)
    if (!res.ok) return jwksCache?.keys ?? []
    const data = (await res.json()) as { keys?: JWK[] }
    // 対称鍵（HS256）プロジェクトでは keys が空。空でもキャッシュし、
    // リクエストごとに jwks.json を叩き直さないようにする（getClaims は
    // HS256 を検知して getUser へフォールバックするため keys は渡さない）
    jwksCache = { keys: data.keys ?? [], expiresAt: now + JWKS_TTL_MS }
    return jwksCache.keys
  } catch {
    // 取得失敗時は stale を使い、無ければ空にして getClaims 側の検証（getUser
    // フォールバック含む）に委ねる。ここでフェイルクローズしない
    return jwksCache?.keys ?? []
  }
}

// JWT の header 部分だけをローカルでデコードする（署名検証はしない、alg/kid の確認専用）。
// header は常に ASCII なので atob で十分（payload と違い unicode を考慮する必要がない）。
// 失敗時は null を返し、呼び出し側は「非対称鍵とはみなさない」扱いにする。
function decodeJwtHeader(token: string): { alg?: string; kid?: string } | null {
  try {
    const headerB64Url = token.split('.')[0]
    if (!headerB64Url) return null
    const base64 = headerB64Url.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64)) as { alg?: string; kid?: string }
  } catch {
    return null
  }
}

// getClaims 内部の判定条件（HS256 / kid 無し / WebCrypto 不在なら getUser にフォールバック）を
// 先取りする。ここで非対称鍵だと分かった場合だけ JWKS を取りに行くことで、対称鍵運用中
// （署名鍵移行前）に毎回 .well-known/jwks.json への無駄な往復を払わないようにする。
function needsJwks(header: { alg?: string; kid?: string } | null): boolean {
  if (!header?.alg || !header.kid || header.alg.startsWith('HS')) return false
  return 'crypto' in globalThis && 'subtle' in globalThis.crypto
}

/**
 * access token を検証してユーザー ID（JWT の sub）を返す。検証できなければ null。
 *
 * - 非対称署名鍵（RS/ES + kid）: キャッシュ済み JWKS で署名をローカル検証する
 *   （JWKS 取得後はネットワーク往復なし）
 * - 対称鍵（HS256）や JWKS 未設定・WebCrypto 不在: JWKS を取得せず getClaims に委ね、
 *   内部で getUser にフォールバックさせる（Auth API 往復 1 回のみ・後退しない）
 *
 * token を省略すると Cookie のセッションから検証する。getSession を明示的に呼んで
 * トークンを解決してから getClaims に渡すため、期限切れ時のリフレッシュ副作用は維持しつつ、
 * header を見て JWKS が要るかどうかを事前判定できる。
 */
export async function verifyAccessToken(auth: SupabaseAuth, token?: string): Promise<string | null> {
  let resolvedToken = token
  if (!resolvedToken) {
    const { data } = await auth.getSession()
    resolvedToken = data.session?.access_token
    if (!resolvedToken) return null
  }

  const header = decodeJwtHeader(resolvedToken)
  const keys = needsJwks(header) ? await getCachedJwks() : []
  const { data, error } = await auth.getClaims(resolvedToken, keys.length > 0 ? { jwks: { keys } } : undefined)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub
}

/** テスト用: モジュールレベルの JWKS キャッシュをリセットする */
export function __resetJwksCacheForTest() {
  jwksCache = null
}
