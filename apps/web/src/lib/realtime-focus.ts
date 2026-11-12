// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Realtime 接続中のタブ復帰では、最後の取得からこの時間を過ぎたクエリだけを取り直す。
// Broadcast で追えない変更（設定・ステータス名など）は、接続中は最大この時間遅れて画面に出る。
// どのクエリが Broadcast で追えるかの対応表は持たない（書き込み経路ごとの抜けを塞ぎ続けることになるため）。
export const CONNECTED_FOCUS_REFETCH_AFTER_MS = 5 * 60 * 1000

// 切断中と、まだ繋がる前は true。タブ復帰のたびに取り直して取りこぼしを回収する。
let catchUp = true

export function setRealtimeFocusCatchUp(enabled: boolean) {
  catchUp = enabled
}

export function refetchOnWindowFocus(
  query: { state: { dataUpdatedAt: number } },
  now: number = Date.now(),
): boolean {
  if (catchUp) return true
  return now - query.state.dataUpdatedAt >= CONNECTED_FOCUS_REFETCH_AFTER_MS
}
