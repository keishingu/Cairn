// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// Realtime の購読を「user:{userId} + 表示中のチャット」に絞るための共通部品（Web / Expo）。
// 画面外のチャンネルの変化は DB が user トピックへ channel_ids だけを送る
// （supabase/migrations/20261105120000_realtime_user_topic_channel_activity.sql）。

/** 画面を離れてからチャンネルの購読を外すまでの猶予。行き来や再マウントで join / leave を繰り返さない */
export const REALTIME_CHANNEL_RELEASE_DELAY_MS = 5_000

/** realtime.send / realtime.broadcast_changes のペイロードから table を取り出す */
export function realtimePayloadTable(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const table = (payload as { table?: unknown }).table
  return typeof table === 'string' ? table : undefined
}

/** user トピックのチャンネル活動通知（messages / tasks）から、変化したチャンネルの ID を取り出す */
export function realtimePayloadChannelIds(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const ids = (payload as { channel_ids?: unknown }).channel_ids
  if (!Array.isArray(ids)) return []
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export interface ActiveChannelRegistry {
  /** チャンネルを表示し始めたときに呼ぶ。戻り値の関数で表示をやめる（同じ ID を複数画面で数える） */
  acquire: (channelId: string) => () => void
  /** 表示中のチャンネル ID（ソート済み・カンマ区切り）。変化しない限り同じ文字列を返す */
  getSnapshot: () => string
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

type Timer = ReturnType<typeof setTimeout>

export function createActiveChannelRegistry(
  releaseDelayMs: number = REALTIME_CHANNEL_RELEASE_DELAY_MS,
): ActiveChannelRegistry {
  const counts = new Map<string, number>()
  const pendingRelease = new Map<string, Timer>()
  const listeners = new Set<() => void>()
  let snapshot = ''

  const emit = () => {
    const next = [...counts.keys()].sort().join(',')
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  const acquire = (channelId: string) => {
    const timer = pendingRelease.get(channelId)
    if (timer) {
      clearTimeout(timer)
      pendingRelease.delete(channelId)
    }
    counts.set(channelId, (counts.get(channelId) ?? 0) + 1)
    emit()

    let released = false
    return () => {
      if (released) return
      released = true
      const count = (counts.get(channelId) ?? 0) - 1
      if (count > 0) {
        counts.set(channelId, count)
        return
      }
      // 0 になっても猶予のあいだは購読を残す。猶予中に再表示されたら acquire がタイマーを取り消す
      counts.set(channelId, 0)
      const releaseTimer = setTimeout(() => {
        pendingRelease.delete(channelId)
        if ((counts.get(channelId) ?? 0) > 0) return
        counts.delete(channelId)
        emit()
      }, releaseDelayMs)
      pendingRelease.set(channelId, releaseTimer)
    }
  }

  return {
    acquire,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      for (const timer of pendingRelease.values()) clearTimeout(timer)
      pendingRelease.clear()
      counts.clear()
      listeners.clear()
      snapshot = ''
    },
  }
}

export interface ChannelActivityRefresh {
  /** チャンネル一覧（未読数・並び）を取り直す */
  channelLists: boolean
  /** タスク一覧（マイタスク・カンバン・チャット情報）を取り直す */
  tasks: boolean
  /** メッセージを取り直す（表示していなければ古い扱いにするだけ）チャンネル */
  messageChannelIds: string[]
  /** チャット情報のファイル一覧を取り直すチャンネル */
  fileChannelIds: string[]
}

/**
 * user トピックのチャンネル活動通知（messages / tasks）で取り直すものを決める。
 * channel トピックが届いている表示中のチャット（joinedChannelIds）はそちらで取り直すので除く。
 * それ以外の通知は null
 */
export function planChannelActivityRefresh(
  payload: unknown,
  joinedChannelIds: ReadonlySet<string>,
): ChannelActivityRefresh | null {
  const table = realtimePayloadTable(payload)
  if (table !== 'messages' && table !== 'tasks') return null
  const notJoined = realtimePayloadChannelIds(payload).filter((id) => !joinedChannelIds.has(id))
  if (table === 'messages') {
    // 新着・削除・スレッドへの移動（移動元と移動先）。添付の有無は分からないのでファイル一覧も取り直す
    return { channelLists: true, tasks: false, messageChannelIds: notJoined, fileChannelIds: notJoined }
  }
  // タスク化済みの印（メッセージの linkedTasks）もメッセージ側にある
  return { channelLists: false, tasks: true, messageChannelIds: notJoined, fileChannelIds: [] }
}
