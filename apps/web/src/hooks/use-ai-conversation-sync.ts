// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの会話を、サーバーが保存した内容で置き換える（送信済みのメッセージはサーバーを正とする）。
// useChat は会話ごとにメッセージを手元に持ち続ける（initialMessages は最初の表示にしか使わない）ため、
// 応答の後・会話を開いたとき・タブに戻ったときに取り直して置き換える。置き換えてよいかは ConversationServerSync が決める。

import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MessageDto } from '@/app/api/ai/conversations/[id]/messages/route'
import { ConversationServerSync } from '@/lib/ai/conversation-server-sync'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

type LoadResult = 'applied' | 'waiting' | 'failed'

export function useAiConversationSync({ conversationId, isReceiving, onSaved }: {
  conversationId: string
  /** 応答を受信している途中か（その間は置き換えない） */
  isReceiving: boolean
  /** 保存された会話で表示を置き換える */
  onSaved: (saved: MessageDto[]) => void
}) {
  const queryClient = useQueryClient()
  const syncRef = React.useRef(new ConversationServerSync())
  const inFlightIdRef = React.useRef<string | null>(null)
  const isReceivingRef = React.useRef(isReceiving)
  isReceivingRef.current = isReceiving
  const onSavedRef = React.useRef(onSaved)
  onSavedRef.current = onSaved
  const [syncError, setSyncError] = React.useState(false)

  const loadFromServer = React.useCallback(async (): Promise<LoadResult> => {
    const seq = syncRef.current.begin()
    try {
      const res = await fetchWithAuth(`/api/ai/conversations/${conversationId}/messages`)
      if (!res.ok) return 'failed'
      const saved = (await res.json()) as MessageDto[]
      const decision = syncRef.current.decide(saved.map(message => message.id), seq, isReceivingRef.current)
      if (decision === 'waiting') return 'waiting'
      // 'stale' は、より新しい取り直しを反映済みなので捨てる
      if (decision === 'apply') {
        onSavedRef.current(saved)
        queryClient.setQueryData(['ai-messages', conversationId], saved)
        setSyncError(false)
      }
      return 'applied'
    } catch {
      return 'failed'
    }
  }, [conversationId, queryClient])

  // 会話を開いたときと、タブに戻ってきたときにも取り直す（添付のリンクは1時間で切れるため、取得キャッシュの古さに任せない）
  React.useEffect(() => {
    const refresh = async () => {
      if ((await loadFromServer()) === 'failed') setSyncError(true)
    }
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadFromServer])

  return {
    /** 取り直せなかった・送った依頼が保存されなかった（黙って古い表示のままにせず知らせる） */
    syncError,
    reload: async () => {
      setSyncError((await loadFromServer()) !== 'applied')
    },
    /** 依頼を送った。この ID が保存されるまで置き換えない */
    sent: (messageId: string) => {
      syncRef.current.sent(messageId)
      inFlightIdRef.current = messageId
    },
    /** 送信に失敗した。この依頼は保存されないため待つのをやめる（次に置き換えたとき画面からも消える） */
    failed: () => {
      if (inFlightIdRef.current) syncRef.current.abandoned(inFlightIdRef.current)
      inFlightIdRef.current = null
    },
    /**
     * 応答の受信が終わった。サーバーがまだ保存中のことがあるため、保存が追いつくまで少し待って取り直す。
     * 追いつかなければ、この依頼は保存されなかったものとして待つのをやめて知らせる（続けて送った依頼は引き続き待つ）
     */
    finished: async () => {
      const sentId = inFlightIdRef.current
      inFlightIdRef.current = null
      if (!sentId) return
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
        const result = await loadFromServer()
        if (result === 'applied' || !syncRef.current.isAwaiting(sentId)) return
      }
      syncRef.current.abandoned(sentId)
      setSyncError(true)
    },
  }
}
