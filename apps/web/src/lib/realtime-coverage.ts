// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 接続中のフォーカス再取得を止めてよい queryKey の先頭。
// 入れる条件は次の両方を満たすこと。
// 1. そのデータを変える書き込みが、行の INSERT / UPDATE / DELETE（ソフトデリートを含む）として Broadcast される。
// 2. realtime-provider がその Broadcast で、このキーを invalidate する。
//
// 一部の操作しか届かないキーは入れない。これまで外したもの:
// - files / project-files … ファイルテーブルに Broadcast がない
// - tasks … チャンネルのないタスクは broadcast_tasks_* が配信しない
// - projects … 作成とカバー写真だけの更新は system メッセージも Broadcast も出さない
// - workspace-channels / project-channels / dms … チャンネル作成は INSERT だけで、
//   broadcast_workspace_channel_changes は workspace の UPDATE / DELETE しか配らない
// - channel-files … メッセージ経由の添付は届くが、ファイル名の変更などは届かない
export const BROADCAST_COVERED_QUERY_KEYS = {
  // messages の INSERT/UPDATE（編集・ソフトデリート）、message_reactions、message_blocks。
  // 表示中は channel トピック、画面外のメッセージは user トピック。
  messages: ['messages'] as const,
  // notifications の INSERT/UPDATE/DELETE。badge-count もこの配下。
  notifications: ['notifications'] as const,
  // app_views の INSERT/UPDATE/DELETE。
  appViews: ['app-views'] as const,
  // ai_nudges の INSERT/UPDATE（解消は status の UPDATE）。
  aiNudges: ['ai-nudges'] as const,
} as const

export const FOCUS_REFETCH_EXEMPT_ROOTS = Object.values(BROADCAST_COVERED_QUERY_KEYS).map(
  (key) => key[0],
)

export function coveredMessagesQueryKey(channelId: string) {
  return [...BROADCAST_COVERED_QUERY_KEYS.messages, channelId] as const
}
