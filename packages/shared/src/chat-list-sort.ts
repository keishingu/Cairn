// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/** チャット一覧の並び順 */
export const CHAT_LIST_SORTS = ['created', 'updated', 'startDate', 'name'] as const
export type ChatListSort = (typeof CHAT_LIST_SORTS)[number]

/** 並び順はセクションごとに別々に選んで保存する */
export type ChatListSection = 'projects' | 'channels' | 'dms'

/**
 * セクションごとに選べる並び順（メニューにはこの順で並べる）と既定値。
 * 実施日を持つのはプロジェクトだけ。DM は作成順の代わりに従来の相手の名前順を既定にする
 */
export const CHAT_LIST_SECTION_SORTS: Record<ChatListSection, readonly ChatListSort[]> = {
  projects: ['created', 'updated', 'startDate', 'name'],
  channels: ['created', 'updated', 'name'],
  dms: ['name', 'updated'],
}
export const DEFAULT_CHAT_LIST_SORTS: Record<ChatListSection, ChatListSort> = {
  projects: 'created',
  channels: 'created',
  dms: 'name',
}

/** メニューの表示名（i18n キー。英語の UI 文） */
export const CHAT_LIST_SORT_LABELS: Record<ChatListSort, string> = {
  created: 'Sort by date created',
  updated: 'Sort by recent activity',
  startDate: 'Sort by start date',
  name: 'Sort by name',
}

/** 保存値を解釈する。そのセクションで選べない値（古い版・手で書き換えた値）は既定に戻す */
export function parseChatListSort(section: ChatListSection, value: string | null | undefined): ChatListSort {
  const options = CHAT_LIST_SECTION_SORTS[section]
  return options.includes(value as ChatListSort) ? (value as ChatListSort) : DEFAULT_CHAT_LIST_SORTS[section]
}

export interface ChatListSortKeys<T> {
  name: (item: T) => string
  /** 最終投稿時刻（ISO 8601）。配下のスレッド・マイルストーンの投稿も含めた値を渡す */
  lastMessageAt: (item: T) => string | null
  /** 実施日（'YYYY-MM-DD'）。日付を持たない種類（チャンネル・DM）は渡さず、実施日順では作成順のままにする */
  startDate?: (item: T) => string | null
  /** ピン留め。並び順に関係なくセクションの先頭に固定する */
  pinned?: (item: T) => boolean
}

const nameCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' })

/** null を末尾に回す比較。値があるもの同士は compare の結果に従う */
function compareNullsLast<V>(a: V | null, b: V | null, compare: (a: V, b: V) => number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compare(a, b)
}

/**
 * チャット一覧のセクション内を並べ替える。items は作成順（API の返す順）で渡す。
 * 同順位は作成順を保つ。ピン留めしたものは並び順に関係なく先頭へ置く。
 * - updated: 最終投稿が新しい順。投稿のないものは末尾
 * - startDate: 実施日の古い順（カレンダーと同じ向き）。日付のないものは末尾
 * - name: 名前順（数字は数値として比べる）
 */
export function sortChatList<T>(items: readonly T[], sort: ChatListSort, keys: ChatListSortKeys<T>): T[] {
  const compareBySort = (a: T, b: T): number => {
    switch (sort) {
      case 'created':
        return 0
      case 'updated':
        return compareNullsLast(keys.lastMessageAt(a), keys.lastMessageAt(b), (x, y) => y.localeCompare(x))
      case 'startDate':
        return keys.startDate ? compareNullsLast(keys.startDate(a), keys.startDate(b), (x, y) => x.localeCompare(y)) : 0
      case 'name':
        return nameCollator.compare(keys.name(a), keys.name(b))
    }
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const pinnedDiff = Number(keys.pinned?.(b.item) ?? false) - Number(keys.pinned?.(a.item) ?? false)
      return pinnedDiff || compareBySort(a.item, b.item) || a.index - b.index
    })
    .map(({ item }) => item)
}

/** 親と配下（スレッド・マイルストーン）の最終投稿時刻のうち最新のもの。配下だけが動いている会話も「更新順」で上げる */
export function latestMessageAt(values: readonly (string | null)[]): string | null {
  return values.reduce<string | null>((latest, value) => (value !== null && (latest === null || value > latest) ? value : latest), null)
}
