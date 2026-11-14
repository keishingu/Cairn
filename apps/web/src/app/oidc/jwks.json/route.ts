// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { OIDC_CORS_HEADERS, oidcPreflightResponse } from '@/lib/oidc/config'
import { getOidcPublicJwks, OidcConfigError } from '@/lib/oidc/keys'

/** ID トークンを検証するための公開鍵。鍵の入れ替え中は旧鍵も載る（docs/oidc-design.md §8 の6） */
export function GET() {
  try {
    return Response.json(getOidcPublicJwks(), { headers: { ...OIDC_CORS_HEADERS, 'Cache-Control': 'public, max-age=300' } })
  } catch (error) {
    if (error instanceof OidcConfigError) {
      console.error('[GET /oidc/jwks.json] signing key:', error.message)
      return Response.json({ error: 'server_error' }, { status: 500 })
    }
    throw error
  }
}

export function OPTIONS() {
  return oidcPreflightResponse()
}
