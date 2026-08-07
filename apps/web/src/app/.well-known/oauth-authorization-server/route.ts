// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { getOAuthIssuer } from '@/lib/mcp-oauth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
}

export function GET(req: Request) {
  const issuer = getOAuthIssuer(req)
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'write'],
    },
    { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=3600' } },
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
