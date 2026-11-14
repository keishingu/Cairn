// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  createOAuthSecret,
  getMcpResource,
  hashOAuthValue,
  McpOAuthError,
  oauthErrorResponse,
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_REFRESH_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_TTL_SECONDS,
  parseOAuthScope,
  verifyPkceS256,
} from '@/lib/mcp-oauth'

type TokenPair = {
  accessToken: ReturnType<typeof createOAuthSecret>
  refreshToken: ReturnType<typeof createOAuthSecret>
  accessExpiresAt: Date
  refreshExpiresAt: Date
}

function createTokenPair(): TokenPair {
  return {
    accessToken: createOAuthSecret(OAUTH_ACCESS_TOKEN_PREFIX),
    refreshToken: createOAuthSecret(OAUTH_REFRESH_TOKEN_PREFIX),
    accessExpiresAt: new Date(Date.now() + OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000),
    refreshExpiresAt: new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
  }
}

function tokenResponse(tokens: TokenPair, scope: 'read' | 'write'): Response {
  return Response.json(
    {
      access_token: tokens.accessToken.value,
      token_type: 'Bearer',
      expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: tokens.refreshToken.value,
      scope: scope === 'write' ? 'read write' : 'read',
    },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  )
}

export async function POST(req: Request) {
  if (req.headers.has('authorization')) {
    return oauthErrorResponse('invalid_client', 'Only public clients with PKCE are supported', 401)
  }
  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return oauthErrorResponse('invalid_request', 'Invalid form body')
  }

  const resource = form.get('resource')
  if (resource !== getMcpResource(req)) {
    return oauthErrorResponse('invalid_target', 'resource must exactly match the MCP URL')
  }
  const clientId = form.get('client_id')
  if (!clientId) return oauthErrorResponse('invalid_client', 'client_id is required', 401)

  try {
    if (form.get('grant_type') === 'authorization_code') {
      return await exchangeAuthorizationCode(form, clientId, resource)
    }
    if (form.get('grant_type') === 'refresh_token') {
      return await rotateRefreshToken(form, clientId, resource)
    }
    return oauthErrorResponse('unsupported_grant_type', 'Unsupported grant_type')
  } catch (error) {
    if (error instanceof McpOAuthError) {
      return oauthErrorResponse(error.code, error.message, error.status === 401 ? 401 : 400)
    }
    console.error('[POST /api/oauth/token]', error)
    return oauthErrorResponse('server_error', 'Token exchange failed')
  }
}

async function exchangeAuthorizationCode(
  form: URLSearchParams,
  clientId: string,
  resource: string,
): Promise<Response> {
  const code = form.get('code') ?? ''
  const redirectUri = form.get('redirect_uri') ?? ''
  const verifier = form.get('code_verifier') ?? ''
  if (!code || !redirectUri || !verifier) {
    throw new McpOAuthError(
      400,
      'invalid_request',
      'code, redirect_uri, and code_verifier are required',
    )
  }

  const {
    activeWorkspaceMembers,
    db,
    mcpOAuthAccessTokens,
    mcpOAuthAuthorizationCodes,
    mcpOAuthConnections,
    mcpOAuthRefreshTokens,
  } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        codeId: mcpOAuthAuthorizationCodes.id,
        connectionId: mcpOAuthConnections.id,
        clientId: mcpOAuthConnections.clientId,
        scope: mcpOAuthConnections.scope,
        resource: mcpOAuthConnections.resource,
        redirectUri: mcpOAuthAuthorizationCodes.redirectUri,
        codeChallenge: mcpOAuthAuthorizationCodes.codeChallenge,
        expiresAt: mcpOAuthAuthorizationCodes.expiresAt,
        usedAt: mcpOAuthAuthorizationCodes.usedAt,
        role: activeWorkspaceMembers.role,
      })
      .from(mcpOAuthAuthorizationCodes)
      .innerJoin(
        mcpOAuthConnections,
        eq(mcpOAuthConnections.id, mcpOAuthAuthorizationCodes.connectionId),
      )
      .innerJoin(
        activeWorkspaceMembers,
        and(
          eq(activeWorkspaceMembers.workspaceId, mcpOAuthConnections.workspaceId),
          eq(activeWorkspaceMembers.userId, mcpOAuthConnections.userId),
        ),
      )
      .where(
        and(
          eq(mcpOAuthAuthorizationCodes.codeHash, hashOAuthValue(code)),
          isNull(mcpOAuthConnections.revokedAt),
        ),
      )
      .limit(1)
      .for('update')

    if (
      !row ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.clientId !== clientId ||
      row.resource !== resource ||
      row.redirectUri !== redirectUri ||
      row.role === 'guest' ||
      !verifyPkceS256(verifier, row.codeChallenge)
    ) {
      return null
    }

    const tokens = createTokenPair()
    await tx
      .update(mcpOAuthAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mcpOAuthAuthorizationCodes.id, row.codeId),
          isNull(mcpOAuthAuthorizationCodes.usedAt),
        ),
      )
    await tx.insert(mcpOAuthAccessTokens).values({
      connectionId: row.connectionId,
      tokenHash: tokens.accessToken.hash,
      expiresAt: tokens.accessExpiresAt,
    })
    await tx.insert(mcpOAuthRefreshTokens).values({
      connectionId: row.connectionId,
      tokenHash: tokens.refreshToken.hash,
      expiresAt: tokens.refreshExpiresAt,
    })
    return { tokens, scope: row.scope }
  })

  if (!result)
    throw new McpOAuthError(400, 'invalid_grant', 'Authorization code is invalid or expired')
  return tokenResponse(result.tokens, result.scope)
}

async function rotateRefreshToken(
  form: URLSearchParams,
  clientId: string,
  resource: string,
): Promise<Response> {
  const refreshToken = form.get('refresh_token') ?? ''
  if (!refreshToken) throw new McpOAuthError(400, 'invalid_request', 'refresh_token is required')

  const {
    activeWorkspaceMembers,
    db,
    mcpOAuthAccessTokens,
    mcpOAuthConnections,
    mcpOAuthRefreshTokens,
  } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        refreshId: mcpOAuthRefreshTokens.id,
        connectionId: mcpOAuthConnections.id,
        clientId: mcpOAuthConnections.clientId,
        scope: mcpOAuthConnections.scope,
        resource: mcpOAuthConnections.resource,
        expiresAt: mcpOAuthRefreshTokens.expiresAt,
        usedAt: mcpOAuthRefreshTokens.usedAt,
        revokedAt: mcpOAuthRefreshTokens.revokedAt,
        role: activeWorkspaceMembers.role,
      })
      .from(mcpOAuthRefreshTokens)
      .innerJoin(
        mcpOAuthConnections,
        eq(mcpOAuthConnections.id, mcpOAuthRefreshTokens.connectionId),
      )
      .innerJoin(
        activeWorkspaceMembers,
        and(
          eq(activeWorkspaceMembers.workspaceId, mcpOAuthConnections.workspaceId),
          eq(activeWorkspaceMembers.userId, mcpOAuthConnections.userId),
        ),
      )
      .where(
        and(
          eq(mcpOAuthRefreshTokens.tokenHash, hashOAuthValue(refreshToken)),
          isNull(mcpOAuthConnections.revokedAt),
        ),
      )
      .limit(1)
      .for('update')

    if (!row || row.clientId !== clientId || row.resource !== resource || row.role === 'guest') {
      return { kind: 'invalid' as const }
    }
    if (row.usedAt || row.revokedAt) {
      await tx
        .update(mcpOAuthConnections)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(mcpOAuthConnections.id, row.connectionId), isNull(mcpOAuthConnections.revokedAt)),
        )
      return { kind: 'reused' as const }
    }
    if (row.expiresAt <= new Date()) return { kind: 'invalid' as const }

    if (form.has('scope')) {
      const requested = parseOAuthScope(form.get('scope'))
      if (requested.scope !== row.scope) return { kind: 'invalid_scope' as const }
    }

    const tokens = createTokenPair()
    await tx
      .update(mcpOAuthRefreshTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(mcpOAuthRefreshTokens.id, row.refreshId), isNull(mcpOAuthRefreshTokens.usedAt)))
    await tx.insert(mcpOAuthAccessTokens).values({
      connectionId: row.connectionId,
      tokenHash: tokens.accessToken.hash,
      expiresAt: tokens.accessExpiresAt,
    })
    await tx.insert(mcpOAuthRefreshTokens).values({
      connectionId: row.connectionId,
      tokenHash: tokens.refreshToken.hash,
      expiresAt: tokens.refreshExpiresAt,
    })
    return { kind: 'ok' as const, tokens, scope: row.scope }
  })

  if (result.kind === 'invalid_scope') {
    throw new McpOAuthError(400, 'invalid_scope', 'Refresh cannot change the granted scope')
  }
  if (result.kind !== 'ok') {
    throw new McpOAuthError(
      400,
      'invalid_grant',
      result.kind === 'reused'
        ? 'Refresh token reuse revoked the connection'
        : 'Refresh token is invalid or expired',
    )
  }
  return tokenResponse(result.tokens, result.scope)
}
