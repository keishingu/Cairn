// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { oauthErrorResponse } from '@/lib/mcp-oauth'
import {
  getOidcIssuer,
  OIDC_ACCESS_TOKEN_TTL_SECONDS,
  OIDC_CORS_HEADERS,
  OIDC_ID_TOKEN_TTL_SECONDS,
  oidcPreflightResponse,
} from '@/lib/oidc/config'
import { OidcConfigError, signOidcIdToken } from '@/lib/oidc/keys'
import {
  exchangeOidcAuthorizationCode,
  loadOidcUserClaims,
  OidcTokenError,
  verifyOidcClientSecret,
} from '@/lib/oidc/tokens'

/** client_secret_basic（Authorization ヘッダー）か client_secret_post / none（フォーム）からクライアントを取り出す */
function readClientCredentials(
  req: Request,
  form: URLSearchParams,
): { clientId: string; clientSecret: string | null } | null {
  const authorization = req.headers.get('authorization')
  if (authorization?.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator <= 0) return null
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    }
  }
  const clientId = form.get('client_id')
  if (!clientId) return null
  return { clientId, clientSecret: form.get('client_secret') }
}

/**
 * 「Cairn でログイン」のトークンエンドポイント（docs/oidc-design.md §5・§6）。
 * 認可コードを1回だけ交換し、Cairn 専用の鍵で署名した ID トークンと、UserInfo にだけ使えるアクセストークンを返す。
 * リフレッシュトークンは発行しない
 */
export function OPTIONS() {
  return oidcPreflightResponse()
}

export async function POST(req: Request) {
  const response = await handleTokenRequest(req)
  for (const [key, value] of Object.entries(OIDC_CORS_HEADERS)) response.headers.set(key, value)
  return response
}

async function handleTokenRequest(req: Request): Promise<Response> {
  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return oauthErrorResponse('invalid_request', 'Invalid form body')
  }
  if (form.get('grant_type') !== 'authorization_code') {
    return oauthErrorResponse('unsupported_grant_type', 'Only authorization_code is supported')
  }
  const credentials = readClientCredentials(req, form)
  if (!credentials) return oauthErrorResponse('invalid_client', 'Client authentication is required', 401)
  const code = form.get('code')
  const redirectUri = form.get('redirect_uri')
  const codeVerifier = form.get('code_verifier')
  if (!code || !redirectUri || !codeVerifier) {
    return oauthErrorResponse('invalid_request', 'code, redirect_uri, and code_verifier are required')
  }

  try {
    const { db, oidcClients } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [client] = await db
      .select({ clientType: oidcClients.clientType, clientSecretHash: oidcClients.clientSecretHash })
      .from(oidcClients)
      .where(and(eq(oidcClients.clientId, credentials.clientId), isNull(oidcClients.disabledAt)))
      .limit(1)
    const authenticated =
      client &&
      (client.clientType === 'confidential'
        ? credentials.clientSecret !== null &&
          client.clientSecretHash !== null &&
          verifyOidcClientSecret(credentials.clientSecret, client.clientSecretHash)
        : credentials.clientSecret === null)
    if (!authenticated) return oauthErrorResponse('invalid_client', 'Client authentication failed', 401)

    const exchanged = await exchangeOidcAuthorizationCode({
      code,
      clientId: credentials.clientId,
      redirectUri,
      codeVerifier,
    })
    const { sub, ...userClaims } = await loadOidcUserClaims(exchanged.userId, exchanged.scope)
    const idToken = await signOidcIdToken(
      {
        ...userClaims,
        auth_time: Math.floor(exchanged.authTime.getTime() / 1000),
        ...(exchanged.nonce ? { nonce: exchanged.nonce } : {}),
      },
      {
        issuer: getOidcIssuer(req),
        audience: exchanged.clientId,
        subject: sub,
        expiresInSeconds: OIDC_ID_TOKEN_TTL_SECONDS,
      },
    )
    return Response.json(
      {
        access_token: exchanged.accessToken,
        token_type: 'Bearer',
        expires_in: OIDC_ACCESS_TOKEN_TTL_SECONDS,
        id_token: idToken,
        scope: exchanged.scope,
      },
      { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
    )
  } catch (error) {
    if (error instanceof OidcTokenError) {
      return oauthErrorResponse(error.code, error.message, error.status === 401 ? 401 : 400)
    }
    if (error instanceof OidcConfigError) console.error('[POST /api/oidc/token] signing key:', error.message)
    else console.error('[POST /api/oidc/token]', error)
    return oauthErrorResponse('server_error', 'Token exchange failed')
  }
}
