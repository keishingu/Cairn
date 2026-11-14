// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { parseOAuthScope, type McpOAuthError } from './mcp-oauth'

export interface OAuthAuthorizationRequest {
  clientId: string
  clientName: string
  redirectUri: string
  state: string
  codeChallenge: string
  resource: string
  scope: 'read' | 'write'
  grantedScope: string
}

export async function validateOAuthAuthorizationRequest(
  params: URLSearchParams,
  expectedResource: string,
): Promise<OAuthAuthorizationRequest> {
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const state = params.get('state') ?? ''
  const codeChallenge = params.get('code_challenge') ?? ''
  const resource = params.get('resource') ?? ''

  if (params.get('response_type') !== 'code') throw new Error('response_type must be code')
  if (params.get('response_mode') && params.get('response_mode') !== 'query') {
    throw new Error('Only query response mode is supported')
  }
  if (!clientId || !redirectUri || !state || state.length > 1024) {
    throw new Error('client_id, redirect_uri, and state are required')
  }
  if (
    params.get('code_challenge_method') !== 'S256' ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  ) {
    throw new Error('PKCE S256 is required')
  }
  if (resource !== expectedResource) throw new Error('resource must exactly match the MCP URL')

  const { db, mcpOAuthClients } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [client] = await db
    .select({
      clientId: mcpOAuthClients.clientId,
      clientName: mcpOAuthClients.clientName,
      redirectUris: mcpOAuthClients.redirectUris,
    })
    .from(mcpOAuthClients)
    .where(eq(mcpOAuthClients.clientId, clientId))
    .limit(1)

  if (!client) throw new Error('Unknown OAuth client')
  if (!client.redirectUris.includes(redirectUri)) throw new Error('redirect_uri is not registered')

  let parsedScope: ReturnType<typeof parseOAuthScope>
  try {
    parsedScope = parseOAuthScope(params.get('scope'))
  } catch (error) {
    throw new Error((error as McpOAuthError).message)
  }
  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    state,
    codeChallenge,
    resource,
    ...parsedScope,
  }
}
