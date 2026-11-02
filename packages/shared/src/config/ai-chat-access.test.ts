// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { canUseAiChat, isAiChatAccessLevel } from './ai-chat-access'

describe('canUseAiChat', () => {
  it('「オーナーのみ」は owner だけが使える', () => {
    expect(canUseAiChat('owner', 'owner')).toBe(true)
    expect(canUseAiChat('admin', 'owner')).toBe(false)
    expect(canUseAiChat('member', 'owner')).toBe(false)
    expect(canUseAiChat('guest', 'owner')).toBe(false)
  })

  it('「管理者以上」は owner と admin が使える', () => {
    expect(canUseAiChat('owner', 'admin')).toBe(true)
    expect(canUseAiChat('admin', 'admin')).toBe(true)
    expect(canUseAiChat('member', 'admin')).toBe(false)
    expect(canUseAiChat('guest', 'admin')).toBe(false)
  })

  it('「メンバーも可」はゲストを含む全員が使える', () => {
    for (const role of ['owner', 'admin', 'member', 'guest'] as const) {
      expect(canUseAiChat(role, 'member')).toBe(true)
    }
  })
})

describe('isAiChatAccessLevel', () => {
  it('決まった段階だけを受け入れる', () => {
    expect(isAiChatAccessLevel('admin')).toBe(true)
    expect(isAiChatAccessLevel('guest')).toBe(false)
    expect(isAiChatAccessLevel(null)).toBe(false)
  })
})
