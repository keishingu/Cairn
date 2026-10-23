// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { generateProtectedResourceMetadata } from 'mcp-handler'
import { getMcpResource, getOAuthIssuer } from '@/lib/mcp-oauth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
}

export function GET(req: Request) {
  return Response.json(
    generateProtectedResourceMetadata({
      authServerUrls: [getOAuthIssuer(req)],
      resourceUrl: getMcpResource(req),
      additionalMetadata: {
        resource_name: 'Cairn MCP',
        scopes_supported: ['read', 'write'],
        bearer_methods_supported: ['header'],
      },
    }),
    { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=3600' } },
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
