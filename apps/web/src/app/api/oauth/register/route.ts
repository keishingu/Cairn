// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import {
  createOAuthSecret,
  isValidRedirectUri,
  oauthErrorResponse,
  OAUTH_CLIENT_ID_PREFIX,
} from '@/lib/mcp-oauth'

const registrationSchema = z.object({
  client_name: z.string().trim().max(100).optional(),
  redirect_uris: z.union([z.array(z.string()).min(1).max(10), z.string().min(1)]).transform(
    (value) => (typeof value === 'string' ? [value] : value),
  ),
  application_type: z.enum(['web', 'native']).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return oauthErrorResponse('invalid_client_metadata', 'Request body must be valid JSON')
  }

  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    return oauthErrorResponse('invalid_client_metadata', 'Client metadata is invalid')
  }

  const redirectUris = [...new Set(parsed.data.redirect_uris.map((uri) => uri.trim()))]
  const invalidRedirectUris = redirectUris.filter((uri) => !isValidRedirectUri(uri))
  if (redirectUris.length === 0 || invalidRedirectUris.length > 0) {
    const rejected = invalidRedirectUris.length > 0 ? invalidRedirectUris.join(', ') : '(empty)'
    return oauthErrorResponse(
      'invalid_redirect_uri',
      `Redirect URIs must be exact HTTPS URLs or HTTP loopback URLs: ${rejected}`,
    )
  }

  const grantTypes = parsed.data.grant_types ?? ['authorization_code', 'refresh_token']
  if (!grantTypes.includes('authorization_code')) {
    return oauthErrorResponse('invalid_client_metadata', 'authorization_code is required')
  }
  if (parsed.data.response_types && !parsed.data.response_types.includes('code')) {
    return oauthErrorResponse('invalid_client_metadata', 'response_type code is required')
  }

  const clientName = parsed.data.client_name || 'MCP Client'
  const applicationType = parsed.data.application_type ?? 'web'

  try {
    const { db, mcpOAuthClients } = await import('@cairn/db')
    const clientId = createOAuthSecret(OAUTH_CLIENT_ID_PREFIX).value
    await db.insert(mcpOAuthClients).values({
      clientId,
      clientName,
      redirectUris,
      applicationType,
    })

    return Response.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: clientName,
        redirect_uris: redirectUris,
        application_type: applicationType,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
    )
  } catch (error) {
    console.error('[POST /api/oauth/register]', error)
    return oauthErrorResponse('server_error', 'Client registration failed')
  }
}
