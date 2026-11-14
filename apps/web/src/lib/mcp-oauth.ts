// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getPublicOrigin } from 'mcp-handler'
import {
  apiTokenAllows,
  buildApiTokenRateLimitUpdate,
  MCP_RATE_LIMIT_PER_MINUTE,
} from './api-tokens'
import type { WorkspaceRole } from './access/membership'
import type { ApiTokenScope } from './api-tokens'

export const OAUTH_CLIENT_ID_PREFIX = 'cairn_oauth_client_'
export const OAUTH_AUTHORIZATION_CODE_PREFIX = 'cairn_oauth_code_'
export const OAUTH_ACCESS_TOKEN_PREFIX = 'cairn_oauth_at_'
export const OAUTH_REFRESH_TOKEN_PREFIX = 'cairn_oauth_rt_'
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60

export interface VerifiedMcpOAuthToken {
  kind: 'oauth'
  id: string
  connectionId: string
  clientId: string
  userId: string
  workspaceId: string
  role: WorkspaceRole
  scope: ApiTokenScope
  expiresAt: Date
}

export class McpOAuthError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 429,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'McpOAuthError'
  }
}

export function getOAuthIssuer(req: Request): string {
  if (process.env['APP_URL']) return process.env['APP_URL'].replace(/\/$/, '')
  return getPublicOrigin(req)
}

export function getMcpResource(req: Request): string {
  return `${getOAuthIssuer(req)}/api/mcp`
}

export function getProtectedResourceMetadataUrl(req: Request): string {
  return `${getOAuthIssuer(req)}/.well-known/oauth-protected-resource`
}

export function createOAuthSecret(prefix: string): { value: string; hash: string } {
  const value = `${prefix}${randomBytes(32).toString('base64url')}`
  return { value, hash: hashOAuthValue(value) }
}

export function hashOAuthValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function parseOAuthScope(value: string | null | undefined): {
  scope: ApiTokenScope
  grantedScope: string
} {
  const requested = new Set((value ?? 'read').split(/\s+/).filter(Boolean))
  if (requested.size === 0) requested.add('read')
  if ([...requested].some((scope) => scope !== 'read' && scope !== 'write')) {
    throw new McpOAuthError(400, 'invalid_scope', 'Only read and write scopes are supported')
  }
  const scope: ApiTokenScope = requested.has('write') ? 'write' : 'read'
  return { scope, grantedScope: scope === 'write' ? 'read write' : 'read' }
}

export function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.hash || url.username || url.password) return false
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

export function verifyPkceS256(verifier: string, expectedChallenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const actual = createHash('sha256').update(verifier).digest('base64url')
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expectedChallenge)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function oauthErrorResponse(
  error: string,
  description: string,
  status: 400 | 401 = 400,
): Response {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  )
}

/**
 * OAuth access token も PAT と同様、workspace・active membership・現在 role・scope を毎回照合する。
 */
export async function verifyMcpOAuthAccessToken(
  rawToken: string,
  options: { requiredScope: ApiTokenScope; resource: string; consumeRateLimit?: boolean },
): Promise<VerifiedMcpOAuthToken> {
  if (!rawToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    throw new McpOAuthError(401, 'invalid_token', 'Invalid OAuth access token')
  }

  const { activeWorkspaceMembers, db, mcpOAuthAccessTokens, mcpOAuthConnections } =
    await import('@cairn/db')
  const { and, eq, gt, isNull } = await import('drizzle-orm')
  const [row] = await db
    .select({
      id: mcpOAuthAccessTokens.id,
      connectionId: mcpOAuthConnections.id,
      clientId: mcpOAuthConnections.clientId,
      userId: mcpOAuthConnections.userId,
      workspaceId: mcpOAuthConnections.workspaceId,
      scope: mcpOAuthConnections.scope,
      expiresAt: mcpOAuthAccessTokens.expiresAt,
      role: activeWorkspaceMembers.role,
    })
    .from(mcpOAuthAccessTokens)
    .innerJoin(mcpOAuthConnections, eq(mcpOAuthConnections.id, mcpOAuthAccessTokens.connectionId))
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.workspaceId, mcpOAuthConnections.workspaceId),
        eq(activeWorkspaceMembers.userId, mcpOAuthConnections.userId),
      ),
    )
    .where(
      and(
        eq(mcpOAuthAccessTokens.tokenHash, hashOAuthValue(rawToken)),
        eq(mcpOAuthConnections.resource, options.resource),
        isNull(mcpOAuthConnections.revokedAt),
        gt(mcpOAuthAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!row) throw new McpOAuthError(401, 'invalid_token', 'Invalid or expired OAuth access token')
  if (row.role === 'guest') {
    throw new McpOAuthError(403, 'insufficient_scope', 'Guests cannot use MCP OAuth')
  }
  if (!apiTokenAllows(row.scope, options.requiredScope)) {
    throw new McpOAuthError(403, 'insufficient_scope', 'OAuth token lacks the required scope')
  }

  if (options.consumeRateLimit) {
    const [usage] = await db
      .update(mcpOAuthAccessTokens)
      .set(buildApiTokenRateLimitUpdate(mcpOAuthAccessTokens))
      .where(eq(mcpOAuthAccessTokens.id, row.id))
      .returning({ count: mcpOAuthAccessTokens.rateLimitCount })
    if (!usage || usage.count > MCP_RATE_LIMIT_PER_MINUTE) {
      throw new McpOAuthError(429, 'slow_down', 'OAuth access token rate limit exceeded')
    }
  }

  return { kind: 'oauth', ...row }
}
