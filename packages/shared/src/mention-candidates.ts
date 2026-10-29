// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceRole } from './types/index'

// メンション候補を、そのチャンネルへ到達できる人だけに絞る。
// サーバーの通知宛先判定（apps/web の filterMentionRecipients / requireChannelAccess）と同じ規則で、
// 通知が届かない相手を候補に出してメンションできたように見せないためのもの。
//   - members_only（プライベート / DM）: channel_members に居る人のみ
//   - project: member 以上は全員、guest は project_members に居る場合のみ
//   - workspace（公開チャンネル）: member 以上は全員、guest は channel_members に居る場合のみ
//   - unresolved（チャンネルの種別や所属プロジェクトがまだ分からない）: guest は到達可否を確かめられないため出さない
export type MentionCandidateScope =
  | { kind: 'members_only'; channelMemberIds: ReadonlySet<string> }
  | { kind: 'project'; projectMemberIds: ReadonlySet<string> }
  | { kind: 'workspace'; channelMemberIds: ReadonlySet<string> }
  | { kind: 'unresolved' }

export function filterMentionCandidates<T extends { userId: string; role: WorkspaceRole }>(
  members: ReadonlyArray<T>,
  scope: MentionCandidateScope,
): T[] {
  switch (scope.kind) {
    case 'members_only':
      return members.filter(member => scope.channelMemberIds.has(member.userId))
    case 'project':
      return members.filter(member => member.role !== 'guest' || scope.projectMemberIds.has(member.userId))
    case 'workspace':
      return members.filter(member => member.role !== 'guest' || scope.channelMemberIds.has(member.userId))
    case 'unresolved':
      return members.filter(member => member.role !== 'guest')
  }
}

// 日本語入力では全角の「＠」が入りやすいため、半角 @ と同じく候補を出すきっかけにする。
// 選んだ後は半角 @ に置き換わるので、送信時の `<@id>` への変換は半角だけを見ればよい
const MENTION_QUERY_PATTERN = /[@＠]([^\s@＠]*)$/

/** カーソル直前の `@名前` / `＠名前` を探す。index はトリガー文字の位置 */
export function matchMentionQuery(textBeforeCursor: string): { index: number; query: string } | null {
  const match = MENTION_QUERY_PATTERN.exec(textBeforeCursor)
  if (!match) return null
  return { index: match.index, query: match[1] ?? '' }
}
