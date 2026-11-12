// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 接続中のフォーカス再取得を止めてよい queryKey の先頭。
// 入れる条件は次の両方を満たすこと。
// 1. そのデータを変える書き込みが、行の INSERT / UPDATE / DELETE（ソフトデリートを含む）として Broadcast される。
// 2. realtime-provider がその Broadcast で、このキーを invalidate する。
//
// ギャラリー（project-gallery）とチャンネル参加者の一覧（channel-members）、
// ピン留め・ワークスペース設定は、ここには入れない。ファイル行やチャンネル行だけでは足りない。
export const BROADCAST_COVERED_QUERY_KEYS = {
  // messages の INSERT/UPDATE（編集・ソフトデリート）、message_reactions、message_blocks。
  // 表示中は channel トピック、画面外のメッセージは user トピック。
  // 添付のファイル名は files 行だけが変わる。files の Broadcast でも messages を invalidate する。
  messages: ['messages'] as const,
  // notifications の INSERT/UPDATE/DELETE。badge-count もこの配下。
  notifications: ['notifications'] as const,
  // app_views の INSERT/UPDATE/DELETE。
  appViews: ['app-views'] as const,
  // ai_nudges の INSERT/UPDATE（解消は status の UPDATE）。
  aiNudges: ['ai-nudges'] as const,
  // files の INSERT/UPDATE/DELETE と message_attachments の付け外し。索引状態は metadata の UPDATE。
  files: ['files'] as const,
  projectFiles: ['project-files'] as const,
  channelFiles: ['channel-files'] as const,
  // tasks の INSERT/UPDATE/DELETE。チャンネルのないタスクはワークスペースの所属者へ届く。
  tasks: ['tasks'] as const,
  // projects の INSERT/UPDATE/DELETE（作成・カバー写真・題名・期間・アーカイブ）と、
  // project_members の追加・削除・役割変更（人数・参加・主催）。
  projects: ['projects'] as const,
  // channels の作成・名称・アーカイブと、channel_members、表示名。マイルストーン列は milestones。
  workspaceChannels: ['workspace-channels'] as const,
  projectChannels: ['project-channels'] as const,
  dms: ['dms'] as const,
} as const

export const FOCUS_REFETCH_EXEMPT_ROOTS = Object.values(BROADCAST_COVERED_QUERY_KEYS).map(
  (key) => key[0],
)

export function coveredMessagesQueryKey(channelId: string) {
  return [...BROADCAST_COVERED_QUERY_KEYS.messages, channelId] as const
}

export function coveredChannelFilesQueryKey(channelId: string) {
  return [...BROADCAST_COVERED_QUERY_KEYS.channelFiles, channelId] as const
}
