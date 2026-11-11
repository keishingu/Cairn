// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// realtime-provider.tsx が invalidate する queryKey の先頭と揃える。
// ここにあるクエリだけ、接続中のフォーカス再取得を止める。
// ファイル一覧（['files']）やギャラリーなど、Broadcast が届かないものは対象外で、タブ復帰時に取り直す。
// tasks は含めない。チャンネルのないタスクは broadcast_tasks_changes / broadcast_tasks_activity_to_users が
// 配信せず、マイタスクと詳細は同じ ['tasks'] 配下なので、接続中でもフォーカスで取り直す。
// projects も含めない。projects テーブルに Broadcast は無く、作成とカバー写真だけの更新は
// チャンネルの system メッセージも出さない。接続中でも一覧はタブ復帰で取り直す。
// workspace-channels も含めない。公開チャンネルの作成は channels への INSERT だけで、
// broadcast_workspace_channel_changes は UPDATE/DELETE しか配らない。
const REALTIME_INVALIDATED_ROOTS = new Set([
  'project-channels',
  'dms',
  'messages',
  'channel-files',
  'notifications',
  'app-views',
  'ai-nudges',
])

// 切断中と、まだ繋がる前は true。接続中の取りこぼし回収は Broadcast の invalidate に任せる。
let catchUp = true

export function setRealtimeFocusCatchUp(enabled: boolean) {
  catchUp = enabled
}

export function refetchOnWindowFocus(query: { queryKey: readonly unknown[] }): boolean {
  const root = query.queryKey[0]
  if (typeof root === 'string' && REALTIME_INVALIDATED_ROOTS.has(root)) return catchUp
  return true
}
