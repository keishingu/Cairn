// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const AI_CHAT_RATE_LIMIT_WINDOW_MS = 60_000
export const AI_CHAT_RATE_LIMIT_MAX_REQUESTS = 12

export function createAiChatRateLimitErrorMessage(
  maxRequests = AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
  windowMs = AI_CHAT_RATE_LIMIT_WINDOW_MS,
) {
  const seconds = Math.ceil(windowMs / 1000)
  return `AIチャットは ${seconds} 秒間に ${maxRequests} 回までです。少し待ってから再試行してください`
}

export function isAiChatRateLimited(
  recentRequestCount: number,
  maxRequests = AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
) {
  return recentRequestCount >= maxRequests
}
