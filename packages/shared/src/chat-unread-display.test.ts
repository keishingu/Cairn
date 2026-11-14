// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { chatUnreadDisplay } from './chat-unread-display'

describe('chatUnreadDisplay', () => {
  test('メンションのない新着は太字だけでバッジを出さない', () => {
    expect(chatUnreadDisplay({ unreadCount: 5, unreadMentionCount: 0 })).toEqual({ unread: true, badgeCount: 0 })
  })

  test('メンションがあればメンション数をバッジにする', () => {
    expect(chatUnreadDisplay({ unreadCount: 5, unreadMentionCount: 2 })).toEqual({ unread: true, badgeCount: 2 })
  })

  test('DM は未読数をそのままバッジにする', () => {
    expect(chatUnreadDisplay({ unreadCount: 3, unreadMentionCount: 0 }, { directMessage: true })).toEqual({ unread: true, badgeCount: 3 })
  })

  test('未読がなければ太字もバッジもない', () => {
    expect(chatUnreadDisplay({ unreadCount: 0, unreadMentionCount: 0 })).toEqual({ unread: false, badgeCount: 0 })
  })
})
