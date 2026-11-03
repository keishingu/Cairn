// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { OIDC_CORS_HEADERS, oidcPreflightResponse } from '@/lib/oidc/config'
import { loadOidcUserClaims, OidcTokenError, verifyOidcAccessToken } from '@/lib/oidc/tokens'

/**
 * 「Cairn でログイン」の UserInfo。トークンエンドポイントが発行した cairn_oidc_at_ のアクセストークンでだけ使え、
 * 許可されたスコープの分だけの情報を返す（docs/oidc-design.md §6）
 */
export function OPTIONS() {
  return oidcPreflightResponse()
}

export async function GET(req: Request) {
  const response = await handleUserInfoRequest(req)
  for (const [key, value] of Object.entries(OIDC_CORS_HEADERS)) response.headers.set(key, value)
  return response
}

async function handleUserInfoRequest(req: Request): Promise<Response> {
  const authorization = req.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return unauthorized('invalid_request', 'Bearer token is required')

  try {
    const { userId, scope } = await verifyOidcAccessToken(token)
    return Response.json(await loadOidcUserClaims(userId, scope), {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    })
  } catch (error) {
    if (error instanceof OidcTokenError) {
      if (error.status === 429) return Response.json({ error: error.code }, { status: 429 })
      return unauthorized(error.code, error.message)
    }
    console.error('[GET /api/oidc/userinfo]', error)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}

function unauthorized(code: string, description: string): Response {
  return Response.json(
    { error: code, error_description: description },
    {
      status: 401,
      headers: { 'WWW-Authenticate': `Bearer error="${code}"`, 'Cache-Control': 'no-store' },
    },
  )
}
