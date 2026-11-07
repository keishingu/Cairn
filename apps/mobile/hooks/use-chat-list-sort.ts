import AsyncStorage from '@react-native-async-storage/async-storage'
import React from 'react'
import { Alert } from 'react-native'
import { DEFAULT_CHAT_LIST_SORTS, parseChatListSort, type ChatListSection, type ChatListSort } from '@cairn/shared'
import { useT } from '../components/locale-provider'

const SECTIONS: readonly ChatListSection[] = ['projects', 'channels', 'dms']

// 端末ごとの設定。Web（localStorage）とは同期しない
export const chatListSortKey = (section: ChatListSection) => `cairn:chat_list_sort_${section}_mobile`

export function useChatListSorts(): [
  Record<ChatListSection, ChatListSort>,
  (section: ChatListSection, sort: ChatListSort) => void,
] {
  const t = useT()
  const [sorts, setSorts] = React.useState<Record<ChatListSection, ChatListSort>>(DEFAULT_CHAT_LIST_SORTS)
  // 読み込み完了前に利用者が選んだセクションは、遅れて届いた保存値で上書きしない
  const changedSections = React.useRef(new Set<ChatListSection>())

  React.useEffect(() => {
    let cancelled = false
    AsyncStorage.multiGet(SECTIONS.map(chatListSortKey))
      .then((entries) => {
        if (cancelled) return
        setSorts((previous) => {
          const next = { ...previous }
          SECTIONS.forEach((section, index) => {
            if (!changedSections.current.has(section)) next[section] = parseChatListSort(section, entries[index]?.[1])
          })
          return next
        })
      })
      .catch((error: unknown) => {
        // 読めなくても既定の並びで一覧は使える。黙って既定にせず知らせる
        if (!cancelled) {
          Alert.alert(
            t('Could not read the chat list order'),
            error instanceof Error ? error.message : t('Please try again.'),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const setSort = React.useCallback(
    (section: ChatListSection, sort: ChatListSort) => {
      changedSections.current.add(section)
      setSorts((previous) => ({ ...previous, [section]: sort }))
      AsyncStorage.setItem(chatListSortKey(section), sort).catch((error: unknown) =>
        Alert.alert(
          t('Could not save the chat list order'),
          error instanceof Error ? error.message : t('Please try again.'),
        ),
      )
    },
    [t],
  )

  return [sorts, setSort]
}
