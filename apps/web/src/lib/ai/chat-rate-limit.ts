// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

const AI_CHAT_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const AI_CHAT_RATE_LIMIT_MAX_REQUESTS = 12

type RateLimitBucket = {
  count: number
  windowStartedAt: number
}

export type AiChatRateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export interface AiChatRateLimitStore {
  consume(workspaceId: string, userId: string, nowMs: number): Promise<AiChatRateLimitResult>
}

function buildRateLimitResult(
  allowed: boolean,
  count: number,
  windowStartedAt: number,
  nowMs: number,
): AiChatRateLimitResult {
  const resetAt = windowStartedAt + AI_CHAT_RATE_LIMIT_WINDOW_MS
  return {
    allowed,
    limit: AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, AI_CHAT_RATE_LIMIT_MAX_REQUESTS - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)),
  }
}

export function createInMemoryAiChatRateLimitStore(): AiChatRateLimitStore {
  const buckets = new Map<string, RateLimitBucket>()

  return {
    async consume(workspaceId, userId, nowMs) {
      for (const [key, bucket] of buckets.entries()) {
        if (nowMs - bucket.windowStartedAt >= AI_CHAT_RATE_LIMIT_WINDOW_MS) {
          buckets.delete(key)
        }
      }

      const key = `${workspaceId}:${userId}`
      const existing = buckets.get(key)
      const bucket = existing && nowMs - existing.windowStartedAt < AI_CHAT_RATE_LIMIT_WINDOW_MS
        ? existing
        : { count: 0, windowStartedAt: nowMs }

      if (bucket.count >= AI_CHAT_RATE_LIMIT_MAX_REQUESTS) {
        buckets.set(key, bucket)
        return buildRateLimitResult(false, bucket.count, bucket.windowStartedAt, nowMs)
      }

      bucket.count += 1
      buckets.set(key, bucket)
      return buildRateLimitResult(true, bucket.count, bucket.windowStartedAt, nowMs)
    },
  }
}

const databaseAiChatRateLimitStore: AiChatRateLimitStore = {
  async consume(workspaceId, userId, nowMs) {
    const now = new Date(nowMs)
    const { db, aiChatRateLimits } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')

    return db.transaction(async (tx) => {
      await tx
        .insert(aiChatRateLimits)
        .values({
          workspaceId,
          userId,
          requestCount: 0,
          windowStartedAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()

      const [row] = await tx
        .select({
          requestCount: aiChatRateLimits.requestCount,
          windowStartedAt: aiChatRateLimits.windowStartedAt,
        })
        .from(aiChatRateLimits)
        .where(and(eq(aiChatRateLimits.workspaceId, workspaceId), eq(aiChatRateLimits.userId, userId)))
        .for('update')
        .limit(1)

      if (!row) {
        throw new Error('AI chat rate limit row not found')
      }

      const windowStartedAtMs = row.windowStartedAt.getTime()
      if (nowMs - windowStartedAtMs >= AI_CHAT_RATE_LIMIT_WINDOW_MS) {
        await tx
          .update(aiChatRateLimits)
          .set({
            requestCount: 1,
            windowStartedAt: now,
            updatedAt: now,
          })
          .where(and(eq(aiChatRateLimits.workspaceId, workspaceId), eq(aiChatRateLimits.userId, userId)))

        return buildRateLimitResult(true, 1, nowMs, nowMs)
      }

      if (row.requestCount >= AI_CHAT_RATE_LIMIT_MAX_REQUESTS) {
        return buildRateLimitResult(false, row.requestCount, windowStartedAtMs, nowMs)
      }

      const nextCount = row.requestCount + 1
      await tx
        .update(aiChatRateLimits)
        .set({
          requestCount: nextCount,
          updatedAt: now,
        })
        .where(and(eq(aiChatRateLimits.workspaceId, workspaceId), eq(aiChatRateLimits.userId, userId)))

      return buildRateLimitResult(true, nextCount, windowStartedAtMs, nowMs)
    })
  },
}

export async function enforceAiChatRateLimit(
  workspaceId: string,
  userId: string,
  nowMs = Date.now(),
  store: AiChatRateLimitStore = databaseAiChatRateLimitStore,
): Promise<AiChatRateLimitResult> {
  return store.consume(workspaceId, userId, nowMs)
}
