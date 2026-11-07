import AsyncStorage from '@react-native-async-storage/async-storage'
import React from 'react'
import { DEFAULT_CHAT_LIST_SORTS, parseChatListSort, type ChatListSection, type ChatListSort } from '@cairn/shared'

const SECTIONS: readonly ChatListSection[] = ['projects', 'channels', 'dms']

// 端末ごとの設定。Web（localStorage）とは同期しない
export const chatListSortKey = (section: ChatListSection) => `cairn:chat_list_sort_${section}_mobile`

export function useChatListSorts(): [
  Record<ChatListSection, ChatListSort>,
  (section: ChatListSection, sort: ChatListSort) => void,
] {
  const [sorts, setSorts] = React.useState<Record<ChatListSection, ChatListSort>>(DEFAULT_CHAT_LIST_SORTS)

  React.useEffect(() => {
    void AsyncStorage.multiGet(SECTIONS.map(chatListSortKey)).then((entries) =>
      setSorts(
        Object.fromEntries(
          SECTIONS.map((section, index) => [section, parseChatListSort(section, entries[index]?.[1])]),
        ) as Record<ChatListSection, ChatListSort>,
      ),
    )
  }, [])

  const setSort = React.useCallback((section: ChatListSection, sort: ChatListSort) => {
    setSorts((previous) => ({ ...previous, [section]: sort }))
    void AsyncStorage.setItem(chatListSortKey(section), sort)
  }, [])

  return [sorts, setSort]
}
