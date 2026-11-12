// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { QueryCacheNotifyEvent } from '@tanstack/react-query'

// Realtime 接続中のタブ復帰では、最後に取得してからこの時間を過ぎたクエリだけを取り直す。
// Broadcast で追えない変更（設定・ステータス名など）は、接続中はこの時間を過ぎた後のタブ復帰まで画面に出ない。
// どのクエリが Broadcast で追えるかの対応表は持たない（書き込み経路ごとの抜けを塞ぎ続けることになるため）。
export const CONNECTED_FOCUS_REFETCH_AFTER_MS = 5 * 60 * 1000

// 切断中と、まだ繋がる前は true。タブ復帰のたびに取り直して取りこぼしを回収する。
let catchUp = true

// サーバーから取得できた時刻。dataUpdatedAt は setQueryData の手動書き込みでも進むため使わない。
const lastFetchedAt = new WeakMap<object, number>()

export function setRealtimeFocusCatchUp(enabled: boolean) {
  catchUp = enabled
}

// QueryCache の subscribe に渡す。取得の成功だけを記録し、setQueryData（manual）は無視する。
export function recordQueryFetchSuccess(event: QueryCacheNotifyEvent, now: number = Date.now()) {
  if (event.type !== 'updated') return
  const { action } = event
  if (action.type !== 'success' || action.manual) return
  lastFetchedAt.set(event.query, now)
}

export function refetchOnWindowFocus(query: object, now: number = Date.now()): boolean {
  if (catchUp) return true
  const fetchedAt = lastFetchedAt.get(query)
  // 取得の記録が無い（手動で入れただけ等）クエリは取り直す
  if (fetchedAt === undefined) return true
  return now - fetchedAt >= CONNECTED_FOCUS_REFETCH_AFTER_MS
}
