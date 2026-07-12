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

/**
 * access token を検証してユーザー ID（JWT の sub）を返す。検証できなければ null。
 *
 * - 非対称署名鍵（RS/ES + kid）: キャッシュ済み JWKS で署名をローカル検証する
 *   （JWKS 取得後はネットワーク往復なし）
 * - 対称鍵（HS256）や JWKS 未設定・WebCrypto 不在: getClaims が内部で
 *   getUser にフォールバックし、従来通り Auth API で検証する（後退しない）
 *
 * token を省略すると Cookie のセッションから検証する（getClaims 経由で
 * getSession が呼ばれ、期限切れ時のリフレッシュ副作用も維持される）。
 */
export async function verifyAccessToken(auth: SupabaseAuth, token?: string): Promise<string | null> {
  const keys = await getCachedJwks()
  const { data, error } = await auth.getClaims(token, keys.length > 0 ? { jwks: { keys } } : undefined)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub
}

/** テスト用: モジュールレベルの JWKS キャッシュをリセットする */
export function __resetJwksCacheForTest() {
  jwksCache = null
}
