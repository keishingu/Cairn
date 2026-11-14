// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 認可リクエストの検証、許可の記録、認可コードの発行（docs/oidc-design.md §4・§7）
import { createOAuthSecret } from '@/lib/mcp-oauth'
import {
  mergeOidcScopes,
  normalizeOidcScope,
  oidcScopeCovers,
  OIDC_AUTHORIZATION_CODE_PREFIX,
  OIDC_AUTHORIZATION_CODE_TTL_SECONDS,
} from './config'

/**
 * 認可リクエストの誤り。redirect_uri を確かめる前の誤り（クライアントが不明・redirect_uri が登録と違う）は
 * 外部アプリへ戻さず画面に表示する（攻撃者の指定した URL へ利用者を送らないため）。確かめた後の誤りは、
 * OAuth の作法どおり error と state を付けて redirect_uri へ戻す
 */
export class OidcAuthorizeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly redirect: { uri: string; state: string | null } | null,
  ) {
    super(message)
    this.name = 'OidcAuthorizeError'
  }
}

export interface ValidatedOidcAuthorization {
  clientId: string
  clientName: string
  redirectUri: string
  scope: string
  state: string | null
  nonce: string | null
  codeChallenge: string
}

const MAX_STATE_LENGTH = 512
const MAX_NONCE_LENGTH = 256
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/

export async function validateOidcAuthorizationRequest(
  params: URLSearchParams,
): Promise<ValidatedOidcAuthorization> {
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  if (!clientId || !redirectUri) {
    throw new OidcAuthorizeError('invalid_request', 'client_id and redirect_uri are required', null)
  }

  const { db, oidcClients } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [client] = await db
    .select({ clientName: oidcClients.clientName, redirectUris: oidcClients.redirectUris })
    .from(oidcClients)
    .where(and(eq(oidcClients.clientId, clientId), isNull(oidcClients.disabledAt)))
    .limit(1)
  if (!client) throw new OidcAuthorizeError('invalid_client', 'Unknown client_id', null)
  // 登録と完全一致するものだけを許す（前方一致・ワイルドカードはオープンリダイレクトになる）
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OidcAuthorizeError('invalid_request', 'redirect_uri does not match the registered value', null)
  }

  const state = params.get('state')
  const back = { uri: redirectUri, state: state && state.length <= MAX_STATE_LENGTH ? state : null }
  if (state && state.length > MAX_STATE_LENGTH) {
    throw new OidcAuthorizeError('invalid_request', 'state is too long', back)
  }
  if (params.get('response_type') !== 'code') {
    throw new OidcAuthorizeError('unsupported_response_type', 'Only response_type=code is supported', back)
  }
  const scope = normalizeOidcScope(params.get('scope'))
  if (!scope) {
    throw new OidcAuthorizeError('invalid_scope', 'scope must include openid and only openid, profile, email', back)
  }
  const codeChallenge = params.get('code_challenge') ?? ''
  if (params.get('code_challenge_method') !== 'S256' || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    throw new OidcAuthorizeError('invalid_request', 'PKCE with code_challenge_method=S256 is required', back)
  }
  const nonce = params.get('nonce')
  if (nonce && nonce.length > MAX_NONCE_LENGTH) {
    throw new OidcAuthorizeError('invalid_request', 'nonce is too long', back)
  }

  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    scope,
    state,
    nonce,
    codeChallenge,
  }
}

/** 外部アプリの redirect_uri に、OAuth の応答（code か error）と state を付けた URL */
export function buildOidcRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value)
  }
  return url.toString()
}

/** 許可を記録し（既存の許可があればスコープを広げる）、認可コードを発行して外部アプリへ戻す URL を返す */
type IssueOidcCodeInput = {
  userId: string
  authTime: Date
  authorization: ValidatedOidcAuthorization
}

export async function issueOidcAuthorizationCode(input: IssueOidcCodeInput): Promise<string>
export async function issueOidcAuthorizationCode(input: IssueOidcCodeInput, requireActiveGrant: true): Promise<string | null>
export async function issueOidcAuthorizationCode(input: IssueOidcCodeInput, requireActiveGrant = false): Promise<string | null> {
  const { authorization } = input
  const code = createOAuthSecret(OIDC_AUTHORIZATION_CODE_PREFIX)
  const { db, oidcAuthorizationCodes, oidcGrants } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')

  const issued = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: oidcGrants.id, scope: oidcGrants.scope })
      .from(oidcGrants)
      .where(
        and(
          eq(oidcGrants.userId, input.userId),
          eq(oidcGrants.clientId, authorization.clientId),
          isNull(oidcGrants.revokedAt),
        ),
      )
      .limit(1)
      .for('update')
    // 自動認可は失効と同じ grant 行をロックして再検証する。失効後に新規 grant を作らない。
    if (requireActiveGrant && (!existing || !oidcScopeCovers(existing.scope, authorization.scope))) return false
    if (existing) {
      const scope = mergeOidcScopes(existing.scope, authorization.scope)
      if (scope !== existing.scope) {
        await tx.update(oidcGrants).set({ scope, grantedAt: new Date() }).where(eq(oidcGrants.id, existing.id))
      }
    } else {
      await tx.insert(oidcGrants).values({
        clientId: authorization.clientId,
        userId: input.userId,
        scope: authorization.scope,
      })
    }
    await tx.insert(oidcAuthorizationCodes).values({
      clientId: authorization.clientId,
      userId: input.userId,
      codeHash: code.hash,
      redirectUri: authorization.redirectUri,
      scope: authorization.scope,
      nonce: authorization.nonce,
      codeChallenge: authorization.codeChallenge,
      authTime: input.authTime,
      expiresAt: new Date(Date.now() + OIDC_AUTHORIZATION_CODE_TTL_SECONDS * 1000),
    })
    return true
  })

  if (!issued) return null
  return buildOidcRedirect(authorization.redirectUri, { code: code.value, state: authorization.state })
}
