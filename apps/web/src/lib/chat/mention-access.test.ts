// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { filterMentionRecipients, type MentionChannelInfo } from './mention-access'

const recipients = [
  { userId: 'member-a' },
  { userId: 'guest-in' },
  { userId: 'guest-out' },
]

describe('filterMentionRecipients', () => {
  it('通常のワークスペースチャンネルでは全員を通知対象にする', () => {
    const channel: MentionChannelInfo = { type: 'workspace', projectId: null, isPrivate: false }
    const result = filterMentionRecipients({
      channel,
      recipients,
      channelMemberIds: new Set(),
      guestIds: new Set(),
      projectMemberIds: new Set(),
    })
    expect(result).toEqual(recipients)
  })

  it('プロジェクトチャンネルでは参加外プロジェクトのゲストを除外する', () => {
    const channel: MentionChannelInfo = { type: 'project', projectId: 'p1', isPrivate: false }
    const result = filterMentionRecipients({
      channel,
      recipients,
      channelMemberIds: new Set(),
      // guest-in / guest-out がゲスト、guest-in だけがプロジェクトメンバー
      guestIds: new Set(['guest-in', 'guest-out']),
      projectMemberIds: new Set(['guest-in']),
    })
    expect(result.map(r => r.userId)).toEqual(['member-a', 'guest-in'])
  })

  it('プライベートチャンネルではチャンネルメンバーのみ通知対象にする', () => {
    const channel: MentionChannelInfo = { type: 'project', projectId: 'p1', isPrivate: true }
    const result = filterMentionRecipients({
      channel,
      recipients,
      channelMemberIds: new Set(['member-a']),
      guestIds: new Set(['guest-in', 'guest-out']),
      projectMemberIds: new Set(['guest-in']),
    })
    expect(result.map(r => r.userId)).toEqual(['member-a'])
  })

  it('member 以上（ゲストでない）はプロジェクト未参加でも通知対象に残す', () => {
    const channel: MentionChannelInfo = { type: 'project', projectId: 'p1', isPrivate: false }
    const result = filterMentionRecipients({
      channel,
      recipients: [{ userId: 'member-a' }],
      channelMemberIds: new Set(),
      guestIds: new Set(),
      projectMemberIds: new Set(),
    })
    expect(result.map(r => r.userId)).toEqual(['member-a'])
  })
})
