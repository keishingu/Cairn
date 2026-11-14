// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { createInMemoryAiChatRateLimitStore, enforceAiChatRateLimit } from './chat-rate-limit'

describe('enforceAiChatRateLimit', () => {
  it('同じ user/workspace は 5 分間に 12 回まで許可する', async () => {
    const store = createInMemoryAiChatRateLimitStore()
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      const result = await enforceAiChatRateLimit('workspace-1', 'user-1', now, store)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(11 - index)
    }

    const blocked = await enforceAiChatRateLimit('workspace-1', 'user-1', now, store)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBe(300)
  })

  it('別ユーザーは別バケットとして扱う', async () => {
    const store = createInMemoryAiChatRateLimitStore()
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      await enforceAiChatRateLimit('workspace-1', 'user-1', now, store)
    }

    await expect(enforceAiChatRateLimit('workspace-1', 'user-2', now, store)).resolves.toMatchObject({ allowed: true })
  })

  it('ウィンドウ経過後は再び許可する', async () => {
    const store = createInMemoryAiChatRateLimitStore()
    const now = Date.UTC(2026, 6, 12, 0, 0, 0)

    for (let index = 0; index < 12; index += 1) {
      await enforceAiChatRateLimit('workspace-1', 'user-1', now, store)
    }

    await expect(enforceAiChatRateLimit('workspace-1', 'user-1', now, store)).resolves.toMatchObject({ allowed: false })
    await expect(enforceAiChatRateLimit('workspace-1', 'user-1', now + 5 * 60 * 1000, store)).resolves.toMatchObject({ allowed: true })
  })
})
