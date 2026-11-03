// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 「Cairn でログイン」（OIDC）の定数とスコープの扱い（docs/oidc-design.md）。
// MCP 用の OAuth（lib/mcp-oauth.ts）とはプレフィックス・issuer・テーブルを分け、部品（ハッシュ・PKCE・
// リダイレクト URI の検証・origin の解決）だけを共有する。
import { getOAuthIssuer } from '@/lib/mcp-oauth'

export const OIDC_CLIENT_ID_PREFIX = 'cairn_oidc_client_'
export const OIDC_CLIENT_SECRET_PREFIX = 'cairn_oidc_secret_'
export const OIDC_AUTHORIZATION_CODE_PREFIX = 'cairn_oidc_code_'
export const OIDC_ACCESS_TOKEN_PREFIX = 'cairn_oidc_at_'
export const OIDC_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60
export const OIDC_ID_TOKEN_TTL_SECONDS = 5 * 60
export const OIDC_ACCESS_TOKEN_TTL_SECONDS = 5 * 60
export const OIDC_SUPPORTED_SCOPES = ['openid', 'profile', 'email'] as const
/** 認可リクエストで受け取るパラメータ。同意画面のフォームにはこれだけを埋める（decision などのフォームの値を外部アプリに足させない） */
export const OIDC_AUTHORIZATION_PARAMS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
] as const

/**
 * ディスカバリー・公開鍵・トークン・UserInfo は、サーバーを持たない PWA（公開クライアント）がブラウザから呼ぶ。
 * Cookie は使わず、コードは PKCE とクライアントの検証に縛られるため、どの origin からも許す
 */
export const OIDC_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export function oidcPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: OIDC_CORS_HEADERS })
}

/** ID トークンの auth_time。利用者が最後に Cairn へログインした時刻で、分からなければ代わりの値を入れずにエラーにする */
export function oidcAuthTime(user: { last_sign_in_at?: string | null }): Date {
  if (!user.last_sign_in_at) throw new Error('last_sign_in_at is missing for the signed-in user')
  return new Date(user.last_sign_in_at)
}

export type OidcScope = (typeof OIDC_SUPPORTED_SCOPES)[number]

/** issuer は origin の下の /oidc。MCP 用の /.well-known/oauth-authorization-server（issuer は origin）と分ける */
export function getOidcIssuer(req: Request): string {
  return `${getOAuthIssuer(req)}/oidc`
}

/**
 * 要求されたスコープを検証し、並びを揃えた文字列にする。openid が無いもの・対応していないスコープを含むものは null。
 * 許可の比較や保存を文字列のまま行えるよう、OIDC_SUPPORTED_SCOPES の順に並べる
 */
export function normalizeOidcScope(value: string | null | undefined): string | null {
  const requested = new Set((value ?? '').split(/\s+/).filter(Boolean))
  if (!requested.has('openid')) return null
  if ([...requested].some((scope) => !(OIDC_SUPPORTED_SCOPES as readonly string[]).includes(scope))) return null
  return OIDC_SUPPORTED_SCOPES.filter((scope) => requested.has(scope)).join(' ')
}

export function hasOidcScope(scope: string, name: OidcScope): boolean {
  return scope.split(' ').includes(name)
}

/** 許可済みのスコープ（granted）が、今回要求されたスコープ（requested）をすべて含むか */
export function oidcScopeCovers(granted: string, requested: string): boolean {
  const grantedSet = new Set(granted.split(' '))
  return requested.split(' ').every((scope) => grantedSet.has(scope))
}

/** 二つの許可を合わせたスコープ（許可を広げるときに使う） */
export function mergeOidcScopes(a: string, b: string): string {
  const merged = new Set([...a.split(' '), ...b.split(' ')])
  return OIDC_SUPPORTED_SCOPES.filter((scope) => merged.has(scope)).join(' ')
}

/** 同意画面に出す、スコープごとの説明（翻訳キー） */
export function describeOidcScopes(scope: string): string[] {
  return scope.split(' ').map((name) => {
    switch (name) {
      case 'openid':
        return 'Your Cairn account ID'
      case 'profile':
        return 'Your name'
      case 'email':
        return 'Your email address'
      default:
        return name
    }
  })
}
