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
  client_name: z.string().trim().min(1).max(100),
  redirect_uris: z.array(z.string()).min(1).max(10),
  application_type: z.enum(['web', 'native']).default('web'),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .default(['authorization_code', 'refresh_token']),
  response_types: z.array(z.literal('code')).default(['code']),
  token_endpoint_auth_method: z.literal('none').default('none'),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return oauthErrorResponse('invalid_client_metadata', 'Request body must be valid JSON')
  }

  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success || parsed.data.redirect_uris.some((uri) => !isValidRedirectUri(uri))) {
    return oauthErrorResponse(
      'invalid_redirect_uri',
      'Redirect URIs must be exact HTTPS URLs or HTTP loopback URLs',
    )
  }
  if (!parsed.data.grant_types.includes('authorization_code')) {
    return oauthErrorResponse('invalid_client_metadata', 'authorization_code is required')
  }

  try {
    const { db, mcpOAuthClients } = await import('@cairn/db')
    const clientId = createOAuthSecret(OAUTH_CLIENT_ID_PREFIX).value
    await db.insert(mcpOAuthClients).values({
      clientId,
      clientName: parsed.data.client_name,
      redirectUris: [...new Set(parsed.data.redirect_uris)],
      applicationType: parsed.data.application_type,
    })

    return Response.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: parsed.data.client_name,
        redirect_uris: parsed.data.redirect_uris,
        application_type: parsed.data.application_type,
        grant_types: parsed.data.grant_types,
        response_types: parsed.data.response_types,
        token_endpoint_auth_method: 'none',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
    )
  } catch (error) {
    console.error('[POST /api/oauth/register]', error)
    return oauthErrorResponse('server_error', 'Client registration failed')
  }
}
