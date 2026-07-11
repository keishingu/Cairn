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

const rateLimitBuckets = new Map<string, RateLimitBucket>()

function pruneExpiredBuckets(nowMs: number) {
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (nowMs - bucket.windowStartedAt >= AI_CHAT_RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(key)
    }
  }
}

export function enforceAiChatRateLimit(
  workspaceId: string,
  userId: string,
  nowMs = Date.now(),
): AiChatRateLimitResult {
  pruneExpiredBuckets(nowMs)

  const key = `${workspaceId}:${userId}`
  const existing = rateLimitBuckets.get(key)
  const bucket = existing && nowMs - existing.windowStartedAt < AI_CHAT_RATE_LIMIT_WINDOW_MS
    ? existing
    : { count: 0, windowStartedAt: nowMs }

  const resetAt = bucket.windowStartedAt + AI_CHAT_RATE_LIMIT_WINDOW_MS
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - nowMs) / 1000))

  if (bucket.count >= AI_CHAT_RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(key, bucket)
    return {
      allowed: false,
      limit: AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    }
  }

  bucket.count += 1
  rateLimitBuckets.set(key, bucket)

  return {
    allowed: true,
    limit: AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
    remaining: AI_CHAT_RATE_LIMIT_MAX_REQUESTS - bucket.count,
    resetAt,
    retryAfterSeconds,
  }
}

export function clearAiChatRateLimitBuckets() {
  rateLimitBuckets.clear()
}
