// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 接続中は Realtime の invalidate が更新を運ぶので、フォーカスのたびに REST を撃たない。
// 切断中と、まだ繋がる前は true。タブ復帰で stale なクエリを取り直し、取りこぼしを回収する。
let catchUp = true

export function setRealtimeFocusCatchUp(enabled: boolean) {
  catchUp = enabled
}

export function refetchOnWindowFocusWhenRealtimeDown(): boolean {
  return catchUp
}
