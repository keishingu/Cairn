// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto'

// trigger_id は1回だけ使える。押した本人・インストールに結びつけ、他人の画面へモーダルを開かせない。
// 有効期限は発行時点から数えるので、Slack の「応答から3秒」に合わせ、配送の期限（3秒）にアプリが応答した後で views.open する3秒を足す
export const TRIGGER_TTL_MS = 6000

function hashTrigger(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueTrigger(input: { installationId: string; userId: string; channelId: string | null }): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const { db, appTriggers } = await import('@cairn/db')
  const { sql } = await import('drizzle-orm')
  await db.insert(appTriggers).values({
    tokenHash: hashTrigger(token),
    installationId: input.installationId,
    userId: input.userId,
    channelId: input.channelId,
    // 期限も DB の時刻で決める（アプリと DB の時計のずれで期限を変えない）
    expiresAt: sql`clock_timestamp() + make_interval(secs => ${TRIGGER_TTL_MS / 1000})`,
  })
  return token
}

export type ConsumedTrigger = { ok: true; userId: string; channelId: string | null } | { ok: false; error: 'invalid_trigger_id' | 'expired_trigger_id' }

/** 未使用・期限内のものだけを1回の UPDATE で使用済みにする（同じ trigger_id の同時利用でも1つだけが通る） */
export async function consumeTrigger(installationId: string, token: string | undefined): Promise<ConsumedTrigger> {
  if (!token) return { ok: false, error: 'invalid_trigger_id' }
  const { db, appTriggers } = await import('@cairn/db')
  const { and, eq, gt, isNull, sql } = await import('drizzle-orm')
  const tokenHash = hashTrigger(token)
  const [used] = await db
    .update(appTriggers)
    .set({ usedAt: sql`now()` })
    // 期限は UPDATE を実行する時点の DB の時刻で比べる（接続待ちの間に切れた trigger_id を通さない）
    .where(and(eq(appTriggers.tokenHash, tokenHash), eq(appTriggers.installationId, installationId), isNull(appTriggers.usedAt), gt(appTriggers.expiresAt, sql`clock_timestamp()`)))
    .returning({ userId: appTriggers.userId, channelId: appTriggers.channelId })
  if (used) return { ok: true, userId: used.userId, channelId: used.channelId }

  const [existing] = await db
    .select({ id: appTriggers.id })
    .from(appTriggers)
    .where(and(eq(appTriggers.tokenHash, tokenHash), eq(appTriggers.installationId, installationId)))
    .limit(1)
  return { ok: false, error: existing ? 'expired_trigger_id' : 'invalid_trigger_id' }
}
