// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { getOAuthIssuer } from '@/lib/mcp-oauth'
import { getOidcIssuer, OIDC_CORS_HEADERS, oidcPreflightResponse, OIDC_SUPPORTED_SCOPES } from '@/lib/oidc/config'

/** 「Cairn でログイン」のディスカバリー（issuer は /oidc。docs/oidc-design.md §5） */
export function GET(req: Request) {
  const issuer = getOidcIssuer(req)
  const origin = getOAuthIssuer(req)
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${origin}/api/oidc/token`,
      userinfo_endpoint: `${origin}/api/oidc/userinfo`,
      jwks_uri: `${issuer}/jwks.json`,
      scopes_supported: OIDC_SUPPORTED_SCOPES,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'name', 'email', 'email_verified'],
    },
    { headers: { ...OIDC_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' } },
  )
}

export function OPTIONS() {
  return oidcPreflightResponse()
}
