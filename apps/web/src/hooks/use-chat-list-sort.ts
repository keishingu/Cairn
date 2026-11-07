'use client'

import * as React from 'react'
import { DEFAULT_CHAT_LIST_SORTS, parseChatListSort, type ChatListSection, type ChatListSort } from '@cairn/shared'
import { useT } from '@/components/locale-provider'
import { chatListSortKey } from '@/lib/storage-keys'
import { toast } from '@/lib/toast'

const SECTIONS: readonly ChatListSection[] = ['projects', 'channels', 'dms']

/**
 * チャット一覧のセクション別の並び順。端末ごとに localStorage へ保存する（Web とアプリで同期しない）。
 * SSR と初回描画は既定にし、マウント後に保存値へ切り替えてハイドレーションの不一致を避ける。
 * ストレージが使えない（プライベートブラウズ・容量超過など）ときは既定のまま動かし、失敗はトーストで知らせる
 */
export function useChatListSorts(): [Record<ChatListSection, ChatListSort>, (section: ChatListSection, sort: ChatListSort) => void] {
  const t = useT()
  const [sorts, setSorts] = React.useState<Record<ChatListSection, ChatListSort>>(DEFAULT_CHAT_LIST_SORTS)

  React.useEffect(() => {
    try {
      setSorts(Object.fromEntries(
        SECTIONS.map(section => [section, parseChatListSort(section, localStorage.getItem(chatListSortKey(section)))]),
      ) as Record<ChatListSection, ChatListSort>)
    } catch {
      toast.error(t('Could not read the chat list order from this browser.'))
    }
  }, [t])

  const setSort = React.useCallback((section: ChatListSection, sort: ChatListSort) => {
    setSorts(previous => ({ ...previous, [section]: sort }))
    try {
      localStorage.setItem(chatListSortKey(section), sort)
    } catch {
      toast.error(t('Could not save the chat list order in this browser.'))
    }
  }, [t])

  return [sorts, setSort]
}
