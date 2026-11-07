'use client'

import * as React from 'react'
import { DEFAULT_CHAT_LIST_SORTS, parseChatListSort, type ChatListSection, type ChatListSort } from '@cairn/shared'
import { chatListSortKey } from '@/lib/storage-keys'

const SECTIONS: readonly ChatListSection[] = ['projects', 'channels', 'dms']

/**
 * チャット一覧のセクション別の並び順。端末ごとに localStorage へ保存する（Web とアプリで同期しない）。
 * SSR と初回描画は既定にし、マウント後に保存値へ切り替えてハイドレーションの不一致を避ける。
 */
export function useChatListSorts(): [Record<ChatListSection, ChatListSort>, (section: ChatListSection, sort: ChatListSort) => void] {
  const [sorts, setSorts] = React.useState<Record<ChatListSection, ChatListSort>>(DEFAULT_CHAT_LIST_SORTS)

  React.useEffect(() => {
    setSorts(Object.fromEntries(
      SECTIONS.map(section => [section, parseChatListSort(section, localStorage.getItem(chatListSortKey(section)))]),
    ) as Record<ChatListSection, ChatListSort>)
  }, [])

  const setSort = React.useCallback((section: ChatListSection, sort: ChatListSort) => {
    setSorts(previous => ({ ...previous, [section]: sort }))
    localStorage.setItem(chatListSortKey(section), sort)
  }, [])

  return [sorts, setSort]
}
