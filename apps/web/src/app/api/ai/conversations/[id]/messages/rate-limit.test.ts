// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  AI_CHAT_RATE_LIMIT_MAX_REQUESTS,
  AI_CHAT_RATE_LIMIT_WINDOW_MS,
  createAiChatRateLimitErrorMessage,
  isAiChatRateLimited,
} from './rate-limit'

describe('isAiChatRateLimited', () => {
  it('上限未満なら許可する', () => {
    expect(isAiChatRateLimited(AI_CHAT_RATE_LIMIT_MAX_REQUESTS - 1)).toBe(false)
  })

  it('上限以上なら制限する', () => {
    expect(isAiChatRateLimited(AI_CHAT_RATE_LIMIT_MAX_REQUESTS)).toBe(true)
    expect(isAiChatRateLimited(AI_CHAT_RATE_LIMIT_MAX_REQUESTS + 3)).toBe(true)
  })
})

describe('createAiChatRateLimitErrorMessage', () => {
  it('秒数と上限を含む文言を返す', () => {
    expect(createAiChatRateLimitErrorMessage()).toBe(
      `AIチャットは ${Math.ceil(AI_CHAT_RATE_LIMIT_WINDOW_MS / 1000)} 秒間に ${AI_CHAT_RATE_LIMIT_MAX_REQUESTS} 回までです。少し待ってから再試行してください`,
    )
  })
})
