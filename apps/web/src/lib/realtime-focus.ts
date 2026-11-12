// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { FOCUS_REFETCH_EXEMPT_ROOTS } from '@/lib/realtime-coverage'

// 既定は再取得する。接続中に止めるのは、書き込みがすべて Broadcast されるキーだけ。
// 一覧は realtime-coverage.ts。ここにキーを足すときは、そちらの条件を先に満たす。
const EXEMPT_ROOTS = new Set<string>(FOCUS_REFETCH_EXEMPT_ROOTS)

// 切断中と、まだ繋がる前は true。接続中の免除キーは Broadcast の invalidate に任せる。
let catchUp = true

// 表示中チャットの channel トピックが JOIN できていない間。
// リアクションとブロックはそのトピックにしか届かないので、そのチャットの messages だけ取り直す。
const messageCatchUpChannelIds = new Set<string>()

export function setRealtimeFocusCatchUp(enabled: boolean) {
  catchUp = enabled
}

export function setMessageChannelFocusCatchUp(channelId: string, enabled: boolean) {
  if (enabled) messageCatchUpChannelIds.add(channelId)
  else messageCatchUpChannelIds.delete(channelId)
}

export function clearMessageChannelFocusCatchUp() {
  messageCatchUpChannelIds.clear()
}

export function refetchOnWindowFocus(query: { queryKey: readonly unknown[] }): boolean {
  if (catchUp) return true
  const root = query.queryKey[0]
  if (root === 'messages') {
    const channelId = query.queryKey[1]
    if (typeof channelId === 'string' && messageCatchUpChannelIds.has(channelId)) return true
  }
  return typeof root !== 'string' || !EXEMPT_ROOTS.has(root)
}
