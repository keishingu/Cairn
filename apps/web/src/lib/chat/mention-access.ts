// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// メンション通知の送信対象を、チャンネルのアクセス範囲で絞るための純粋関数。
// DB 参照（チャンネル種別・メンバー・プロジェクトメンバー）は呼び出し側で解決し、
// ここでは集合演算だけを行うことでユニットテスト可能にしている。
//
// アクセス範囲は requireChannelAccess と同じスコープ感で判定する:
//   - プライベートチャンネル / DM: channel_members に居る人のみ
//   - プロジェクトチャンネル: member 以上は全員可、guest は project_members に居る場合のみ
//   - それ以外（通常のワークスペースチャンネル）: 全ワークスペースメンバー可

export interface MentionChannelInfo {
  type: string
  projectId: string | null
  isPrivate: boolean
}

export function filterMentionRecipients<T extends { userId: string }>(params: {
  channel: MentionChannelInfo
  recipients: T[]
  /** プライベートチャンネルのメンバー（channel_members） */
  channelMemberIds: Set<string>
  /** recipients のうち guest ロールの userId */
  guestIds: Set<string>
  /** チャンネルが属するプロジェクトの project_members の userId */
  projectMemberIds: Set<string>
}): T[] {
  const { channel, recipients, channelMemberIds, guestIds, projectMemberIds } = params

  if (channel.isPrivate) {
    return recipients.filter(r => channelMemberIds.has(r.userId))
  }

  if (channel.type === 'project' && channel.projectId) {
    // guest は参加プロジェクトに居る場合のみ通知。member 以上は常に通知可。
    return recipients.filter(r => !guestIds.has(r.userId) || projectMemberIds.has(r.userId))
  }

  return recipients
}
