// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sql, type SQLWrapper } from 'drizzle-orm'
import type { WorkspaceRole } from '@/lib/access/membership'

export const API_TOKEN_PREFIX = 'cairn_pat_'
export const API_TOKEN_DEFAULT_DAYS = 90
export const API_TOKEN_MAX_DAYS = 365
export const MCP_RATE_LIMIT_PER_MINUTE = 120

export type ApiTokenScope = 'read' | 'write'

export interface VerifiedApiToken {
  id: string
  userId: string
  workspaceId: string
  role: WorkspaceRole
  scope: ApiTokenScope
  expiresAt: Date
}

export class ApiTokenError extends Error {
  constructor(
    public readonly status: 401 | 403 | 429,
    message: string,
  ) {
    super(message)
    this.name = 'ApiTokenError'
  }
}

// allowApiToken は route ごとの allowlist、AsyncLocalStorage は「実際に /api/mcp の
// 検証済みリクエスト内か」を保証する。外部から対象 REST API を PAT で直接呼んでも通さない。
const apiTokenRequestContext = new AsyncLocalStorage<boolean>()

export function runWithApiTokenAccess<T>(callback: () => T): T {
  return apiTokenRequestContext.run(true, callback)
}

export function isApiTokenAccessEnabled(): boolean {
  return apiTokenRequestContext.getStore() === true
}

export function createApiToken(): { token: string; hash: string; prefix: string } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return {
    token,
    hash: hashApiToken(token),
    prefix: token.slice(0, API_TOKEN_PREFIX.length + 8),
  }
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function apiTokenAllows(actual: ApiTokenScope, required: ApiTokenScope): boolean {
  return actual === 'write' || required === 'read'
}

export function buildApiTokenRateLimitUpdate(columns: {
  rateLimitWindowStartedAt: SQLWrapper
  rateLimitCount: SQLWrapper
}) {
  return {
    rateLimitWindowStartedAt: sql`case
      when ${columns.rateLimitWindowStartedAt} < current_timestamp - interval '1 minute'
      then current_timestamp
      else ${columns.rateLimitWindowStartedAt}
    end`,
    rateLimitCount: sql`case
      when ${columns.rateLimitWindowStartedAt} < current_timestamp - interval '1 minute'
      then 1
      else ${columns.rateLimitCount} + 1
    end`,
    lastUsedAt: sql`current_timestamp`,
  }
}

/**
 * PAT の workspace と role は毎回 DB で再照合する。メンバーが無効化された場合や
 * guest に変更された場合、既存 PAT も即座に利用不可になる。
 */
export async function verifyApiToken(
  rawToken: string,
  options: { requiredScope: ApiTokenScope; consumeRateLimit?: boolean },
): Promise<VerifiedApiToken> {
  if (!rawToken.startsWith(API_TOKEN_PREFIX)) {
    throw new ApiTokenError(401, 'Invalid API token')
  }

  const { db, apiTokens, activeWorkspaceMembers } = await import('@cairn/db')
  const { and, eq, gt, isNull } = await import('drizzle-orm')
  const now = new Date()
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      workspaceId: apiTokens.workspaceId,
      scope: apiTokens.scope,
      expiresAt: apiTokens.expiresAt,
      role: activeWorkspaceMembers.role,
    })
    .from(apiTokens)
    .innerJoin(
      activeWorkspaceMembers,
      and(
        eq(activeWorkspaceMembers.workspaceId, apiTokens.workspaceId),
        eq(activeWorkspaceMembers.userId, apiTokens.userId),
      ),
    )
    .where(
      and(
        eq(apiTokens.tokenHash, hashApiToken(rawToken)),
        isNull(apiTokens.revokedAt),
        gt(apiTokens.expiresAt, now),
      ),
    )
    .limit(1)

  if (!row) throw new ApiTokenError(401, 'Invalid or expired API token')
  if (row.role === 'guest') throw new ApiTokenError(403, 'Guests cannot use API tokens')
  if (!apiTokenAllows(row.scope, options.requiredScope)) {
    throw new ApiTokenError(403, 'API token does not have the required scope')
  }

  if (options.consumeRateLimit) {
    const [usage] = await db
      .update(apiTokens)
      .set(buildApiTokenRateLimitUpdate(apiTokens))
      .where(eq(apiTokens.id, row.id))
      .returning({ count: apiTokens.rateLimitCount })

    if (!usage || usage.count > MCP_RATE_LIMIT_PER_MINUTE) {
      throw new ApiTokenError(429, 'API token rate limit exceeded')
    }
  }

  return row
}
