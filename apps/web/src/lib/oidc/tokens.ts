// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// コードの交換・ID トークンに入れる利用者の情報・UserInfo のアクセストークン（docs/oidc-design.md §6）
import { timingSafeEqual } from 'node:crypto'
import { buildApiTokenRateLimitUpdate, MCP_RATE_LIMIT_PER_MINUTE } from '@/lib/api-tokens'
import { createOAuthSecret, hashOAuthValue, verifyPkceS256 } from '@/lib/mcp-oauth'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { hasOidcScope, OIDC_ACCESS_TOKEN_PREFIX, OIDC_ACCESS_TOKEN_TTL_SECONDS } from './config'

export class OidcTokenError extends Error {
  constructor(
    public readonly status: 400 | 401 | 429,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'OidcTokenError'
  }
}

/** 利用者が許可したスコープの分だけの情報。ID トークンと UserInfo の両方で同じものを返す */
export interface OidcUserClaims {
  sub: string
  name?: string
  email?: string
  email_verified?: boolean
}

/** スコープに応じて利用者の情報を集める。取得できなければ代わりの値を入れずにエラーにする */
export async function loadOidcUserClaims(userId: string, scope: string): Promise<OidcUserClaims> {
  const claims: OidcUserClaims = { sub: userId }
  if (hasOidcScope(scope, 'profile')) {
    const { db, profiles } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)
    if (!profile) throw new Error(`profile not found for OIDC claims: ${userId}`)
    claims.name = profile.displayName
  }
  if (hasOidcScope(scope, 'email')) {
    const { data, error } = await createServiceRoleClient().auth.admin.getUserById(userId)
    if (error || !data.user?.email) throw new Error(`email not found for OIDC claims: ${userId}`)
    claims.email = data.user.email
    claims.email_verified = Boolean(data.user.email_confirmed_at)
  }
  return claims
}

/** 機密クライアントの client secret を確かめる。比較は時間差の出ない方法で行う */
export function verifyOidcClientSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOAuthValue(secret))
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export interface ExchangedOidcCode {
  userId: string
  clientId: string
  scope: string
  nonce: string | null
  authTime: Date
  accessToken: string
}

/** 認可コードを1回だけ交換し、UserInfo 用のアクセストークンを発行する */
export async function exchangeOidcAuthorizationCode(input: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<ExchangedOidcCode> {
  const { db, oidcAccessTokens, oidcAuthorizationCodes, oidcClients, oidcGrants } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const accessToken = createOAuthSecret(OIDC_ACCESS_TOKEN_PREFIX)

  const exchanged = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: oidcAuthorizationCodes.id,
        clientId: oidcAuthorizationCodes.clientId,
        userId: oidcAuthorizationCodes.userId,
        redirectUri: oidcAuthorizationCodes.redirectUri,
        scope: oidcAuthorizationCodes.scope,
        nonce: oidcAuthorizationCodes.nonce,
        codeChallenge: oidcAuthorizationCodes.codeChallenge,
        authTime: oidcAuthorizationCodes.authTime,
        expiresAt: oidcAuthorizationCodes.expiresAt,
        usedAt: oidcAuthorizationCodes.usedAt,
      })
      .from(oidcAuthorizationCodes)
      // コードを発行した後に許可が取り消された・クライアントが無効化された場合は交換させない
      .innerJoin(
        oidcClients,
        and(eq(oidcClients.clientId, oidcAuthorizationCodes.clientId), isNull(oidcClients.disabledAt)),
      )
      .innerJoin(
        oidcGrants,
        and(
          eq(oidcGrants.clientId, oidcAuthorizationCodes.clientId),
          eq(oidcGrants.userId, oidcAuthorizationCodes.userId),
          isNull(oidcGrants.revokedAt),
        ),
      )
      .where(eq(oidcAuthorizationCodes.codeHash, hashOAuthValue(input.code)))
      .limit(1)
      .for('update', { of: oidcAuthorizationCodes })
    if (
      !row ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.clientId !== input.clientId ||
      row.redirectUri !== input.redirectUri ||
      !verifyPkceS256(input.codeVerifier, row.codeChallenge)
    ) {
      return null
    }
    await tx
      .update(oidcAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oidcAuthorizationCodes.id, row.id), isNull(oidcAuthorizationCodes.usedAt)))
    await tx.insert(oidcAccessTokens).values({
      clientId: row.clientId,
      userId: row.userId,
      scope: row.scope,
      tokenHash: accessToken.hash,
      expiresAt: new Date(Date.now() + OIDC_ACCESS_TOKEN_TTL_SECONDS * 1000),
    })
    return row
  })

  if (!exchanged) throw new OidcTokenError(400, 'invalid_grant', 'Authorization code is invalid or expired')
  return {
    userId: exchanged.userId,
    clientId: exchanged.clientId,
    scope: exchanged.scope,
    nonce: exchanged.nonce,
    authTime: exchanged.authTime,
    accessToken: accessToken.value,
  }
}

/** UserInfo 用のアクセストークンを確かめる。MCP のトークンと同じく1分あたり120回まで */
export async function verifyOidcAccessToken(token: string): Promise<{ userId: string; scope: string }> {
  if (!token.startsWith(OIDC_ACCESS_TOKEN_PREFIX)) {
    throw new OidcTokenError(401, 'invalid_token', 'Invalid access token')
  }
  const { db, oidcAccessTokens, oidcClients, oidcGrants } = await import('@cairn/db')
  const { and, eq, exists, gt, isNull } = await import('drizzle-orm')
  const [row] = await db
    .update(oidcAccessTokens)
    .set(buildApiTokenRateLimitUpdate(oidcAccessTokens))
    .where(
      and(
        eq(oidcAccessTokens.tokenHash, hashOAuthValue(token)),
        gt(oidcAccessTokens.expiresAt, new Date()),
        // 許可が取り消された・クライアントが無効化されたら、有効期限内のトークンでも使わせない
        exists(
          db
            .select({ id: oidcGrants.id })
            .from(oidcGrants)
            .innerJoin(oidcClients, eq(oidcClients.clientId, oidcGrants.clientId))
            .where(
              and(
                eq(oidcGrants.clientId, oidcAccessTokens.clientId),
                eq(oidcGrants.userId, oidcAccessTokens.userId),
                isNull(oidcGrants.revokedAt),
                isNull(oidcClients.disabledAt),
              ),
            ),
        ),
      ),
    )
    .returning({
      userId: oidcAccessTokens.userId,
      scope: oidcAccessTokens.scope,
      count: oidcAccessTokens.rateLimitCount,
    })
  if (!row) throw new OidcTokenError(401, 'invalid_token', 'Access token is invalid or expired')
  if (row.count > MCP_RATE_LIMIT_PER_MINUTE) {
    throw new OidcTokenError(429, 'rate_limited', 'Too many requests')
  }
  return { userId: row.userId, scope: row.scope }
}
