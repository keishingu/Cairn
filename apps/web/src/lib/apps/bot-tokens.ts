// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto'
import { APP_SCOPES, type AppScope } from '@cairn/db'
import { buildApiTokenRateLimitUpdate } from '@/lib/api-tokens'

// Bot トークンはアプリ自身の身元。人間の代理である PAT / MCP OAuth とは別系統にし、互いの資格情報として通さない
// （docs/app-platform-design.md §3.3）。`xoxb-` にしないのは、GitHub の secret scanning が Slack のトークンと誤認するため
export const BOT_TOKEN_PREFIX = 'cairn_bot_'
// §11 D10。PAT と同じ値
export const BOT_TOKEN_RATE_LIMIT_PER_MINUTE = 120

export interface BotContext {
  tokenId: string
  installationId: string
  appId: string
  workspaceId: string
  botProfileId: string
  scopes: AppScope[]
}

/** Slack Web API と同じエラーコード。route でそのまま `{ ok: false, error }` にする */
export type BotAuthErrorCode = 'not_authed' | 'invalid_auth' | 'token_revoked' | 'ratelimited'

export class BotAuthError extends Error {
  constructor(public readonly code: BotAuthErrorCode) {
    super(code)
    this.name = 'BotAuthError'
  }
}

export function createBotToken(): { token: string; hash: string; prefix: string } {
  const token = `${BOT_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return { token, hash: hashBotToken(token), prefix: token.slice(0, BOT_TOKEN_PREFIX.length + 8) }
}

export function hashBotToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isAppScope(value: string): value is AppScope {
  return (APP_SCOPES as readonly string[]).includes(value)
}

/**
 * トークン・インストールの失効は毎回 DB で確かめる。アンインストールした時点で既存のトークンも使えなくなる。
 * 呼び出し回数はトークン単位で数え、上限を超えたら ratelimited にする
 */
export async function verifyBotToken(rawToken: string | null): Promise<BotContext> {
  if (!rawToken) throw new BotAuthError('not_authed')
  if (!rawToken.startsWith(BOT_TOKEN_PREFIX)) throw new BotAuthError('invalid_auth')

  const { db, appBotTokens, appInstallations } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db
    .select({
      tokenId: appBotTokens.id,
      tokenRevokedAt: appBotTokens.revokedAt,
      installationId: appInstallations.id,
      installationRevokedAt: appInstallations.revokedAt,
      appId: appInstallations.appId,
      workspaceId: appInstallations.workspaceId,
      botProfileId: appInstallations.botProfileId,
      scopes: appInstallations.grantedScopes,
    })
    .from(appBotTokens)
    .innerJoin(appInstallations, eq(appInstallations.id, appBotTokens.installationId))
    .where(eq(appBotTokens.tokenHash, hashBotToken(rawToken)))
    .limit(1)

  if (!row) throw new BotAuthError('invalid_auth')
  if (row.tokenRevokedAt || row.installationRevokedAt) throw new BotAuthError('token_revoked')

  const [usage] = await db
    .update(appBotTokens)
    .set(buildApiTokenRateLimitUpdate(appBotTokens))
    .where(eq(appBotTokens.id, row.tokenId))
    .returning({ count: appBotTokens.rateLimitCount })
  if (!usage || usage.count > BOT_TOKEN_RATE_LIMIT_PER_MINUTE) throw new BotAuthError('ratelimited')

  return {
    tokenId: row.tokenId,
    installationId: row.installationId,
    appId: row.appId,
    workspaceId: row.workspaceId,
    botProfileId: row.botProfileId,
    scopes: row.scopes.filter(isAppScope),
  }
}
