// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest'
import { clearAiChatRateLimitBuckets, enforceAiChatRateLimit } from './chat-rate-limit'

describe('enforceAiChatRateLimit', () => {
  afterEach(() => {
    clearAiChatRateLimitBuckets()
  })

  it('同じ user/workspace は 5 分間に 12 回まで許可する', () => {
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      const result = enforceAiChatRateLimit('workspace-1', 'user-1', now)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(11 - index)
    }

    const blocked = enforceAiChatRateLimit('workspace-1', 'user-1', now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBe(300)
  })

  it('別ユーザーは別バケットとして扱う', () => {
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      enforceAiChatRateLimit('workspace-1', 'user-1', now)
    }

    expect(enforceAiChatRateLimit('workspace-1', 'user-2', now).allowed).toBe(true)
  })

  it('ウィンドウ経過後は再び許可する', () => {
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      enforceAiChatRateLimit('workspace-1', 'user-1', now)
    }

    expect(enforceAiChatRateLimit('workspace-1', 'user-1', now).allowed).toBe(false)
    expect(enforceAiChatRateLimit('workspace-1', 'user-1', now + 5 * 60 * 1000).allowed).toBe(true)
  })
})
