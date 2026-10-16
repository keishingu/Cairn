// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { nextReactionHistory, parseReactionHistory } from '@cairn/shared'
import { reactionHistoryKey } from '@/lib/storage-keys'
import { useCurrentUser } from './use-current-user'

type Snapshot = { recent: string[]; error: boolean }

const EMPTY: Snapshot = { recent: [], error: false }
const listeners = new Set<() => void>()
// useSyncExternalStore は同じ参照を返し続ける必要があるため、保存値ごとに読み取り結果を覚える
const cache = new Map<string, { raw: string | null; snapshot: Snapshot }>()

function readSnapshot(userId: string): Snapshot {
  const key = reactionHistoryKey(userId)
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { recent: [], error: true }
  }
  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.snapshot
  let snapshot: Snapshot
  try {
    snapshot = { recent: parseReactionHistory(raw), error: false }
  } catch {
    // 壊れた保存値は既定の絵文字で黙って置き換えず、読み込めなかったことを表示する
    snapshot = { recent: [], error: true }
  }
  cache.set(key, { raw, snapshot })
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // 別タブで使ったリアクションも候補に反映する
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith('cairn:reaction_history_')) listener() }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** 使ったリアクションを履歴の先頭へ記録する。保存できなければ例外を投げる */
export function recordReactionHistory(userId: string, emoji: string) {
  const current = readSnapshot(userId)
  // 読めない履歴に上書きすると過去の履歴を失うため、記録しない
  if (current.error) throw new Error('Could not read the reaction history')
  localStorage.setItem(reactionHistoryKey(userId), JSON.stringify(nextReactionHistory(current.recent, emoji)))
  listeners.forEach(listener => listener())
}

/** ログイン中のユーザーが最近使ったリアクション（端末のブラウザごと） */
export function useReactionHistory(): Snapshot {
  const { data: me } = useCurrentUser()
  const userId = me?.id
  return React.useSyncExternalStore(
    subscribe,
    () => (userId ? readSnapshot(userId) : EMPTY),
    () => EMPTY,
  )
}
