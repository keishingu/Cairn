// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto'

// trigger_id は Slack と同じく3秒・1回だけ使える。押した本人・インストールに結びつけ、他人の画面へモーダルを開かせない
export const TRIGGER_TTL_MS = 3000

function hashTrigger(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueTrigger(input: { installationId: string; userId: string; channelId: string | null }): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const { db, appTriggers } = await import('@cairn/db')
  await db.insert(appTriggers).values({
    tokenHash: hashTrigger(token),
    installationId: input.installationId,
    userId: input.userId,
    channelId: input.channelId,
    expiresAt: new Date(Date.now() + TRIGGER_TTL_MS),
  })
  return token
}

export type ConsumedTrigger = { ok: true; userId: string; channelId: string | null } | { ok: false; error: 'invalid_trigger_id' | 'expired_trigger_id' }

/** 未使用・期限内のものだけを1回の UPDATE で使用済みにする（同じ trigger_id の同時利用でも1つだけが通る） */
export async function consumeTrigger(installationId: string, token: string | undefined): Promise<ConsumedTrigger> {
  if (!token) return { ok: false, error: 'invalid_trigger_id' }
  const { db, appTriggers } = await import('@cairn/db')
  const { and, eq, gt, isNull } = await import('drizzle-orm')
  const tokenHash = hashTrigger(token)
  const [used] = await db
    .update(appTriggers)
    .set({ usedAt: new Date() })
    .where(and(eq(appTriggers.tokenHash, tokenHash), eq(appTriggers.installationId, installationId), isNull(appTriggers.usedAt), gt(appTriggers.expiresAt, new Date())))
    .returning({ userId: appTriggers.userId, channelId: appTriggers.channelId })
  if (used) return { ok: true, userId: used.userId, channelId: used.channelId }

  const [existing] = await db
    .select({ id: appTriggers.id })
    .from(appTriggers)
    .where(and(eq(appTriggers.tokenHash, tokenHash), eq(appTriggers.installationId, installationId)))
    .limit(1)
  return { ok: false, error: existing ? 'expired_trigger_id' : 'invalid_trigger_id' }
}
