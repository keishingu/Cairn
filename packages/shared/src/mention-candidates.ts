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
