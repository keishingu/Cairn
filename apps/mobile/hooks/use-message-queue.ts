import React from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import * as queue from '../lib/message-queue'
import type { QueuedMessage } from '../lib/message-queue'

export type { QueuedMessage }

// チャンネル単位のオフライン送信キュー。
// 送信はまずキューに積んでから POST し、ネットワークエラー時はキューに残して
// 電波回復（NetInfo）時に自動再送する。最大 queue.MAX_ATTEMPTS 回で failed に落とし、
// 以降はユーザーの「タップして再送」でのみ再試行する
export function useMessageQueue(channelId: string) {
  const qc = useQueryClient()
  const [queued, setQueued] = React.useState<QueuedMessage[]>([])
  const flushingRef = React.useRef(false)

  const refresh = React.useCallback(async () => {
    setQueued(await queue.getAll(channelId))
  }, [channelId])

  const flush = React.useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    try {
      // 圏外での flush は attempts を消費せずスキップする。
      // ここで試行すると、機内モード中に上限へ達して自動再送されなくなる
      const net = await NetInfo.fetch()
      if (net.isConnected === false) return

      const pending = (await queue.getAll(channelId)).filter(m => m.status === 'pending')
      let sentAny = false

      for (const msg of pending) {
        try {
          const res = await apiFetch(`/api/channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              content: msg.content,
              attachmentFileIds: msg.attachmentFileIds,
            }),
          })
          if (res.ok) {
            await queue.remove(msg.tempId)
            sentAny = true
          } else {
            // サーバーが受理しないリクエスト（バリデーション等）はリトライしても
            // 回復しないため即 failed に落とす
            await queue.update(msg.tempId, { status: 'failed', attempts: msg.attempts + 1 })
          }
        } catch {
          // ネットワークエラー。以降のメッセージも失敗するため中断し、順序を保つ
          const attempts = msg.attempts + 1
          await queue.update(
            msg.tempId,
            attempts >= queue.MAX_ATTEMPTS ? { status: 'failed', attempts } : { attempts },
          )
          break
        }
      }

      if (sentAny) {
        await qc.invalidateQueries({ queryKey: ['messages', channelId] })
        await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' }).catch(() => undefined)
      }
    } finally {
      flushingRef.current = false
      await refresh()
    }
  }, [channelId, qc, refresh])

  const send = React.useCallback(
    async (content: string, attachmentFileIds: string[] = []) => {
      await queue.enqueue({
        tempId: queue.createTempId(),
        channelId,
        content,
        attachmentFileIds,
        createdAt: new Date().toISOString(),
      })
      await refresh()
      void flush()
    },
    [channelId, refresh, flush],
  )

  const retry = React.useCallback(
    async (tempId: string) => {
      await queue.update(tempId, { status: 'pending', attempts: 0 })
      await refresh()
      void flush()
    },
    [refresh, flush],
  )

  const discard = React.useCallback(
    async (tempId: string) => {
      await queue.remove(tempId)
      await refresh()
    },
    [refresh],
  )

  React.useEffect(() => {
    void refresh()
    void flush()
    // 電波回復時にキューを自動再送する
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flush()
    })
    return unsubscribe
  }, [refresh, flush])

  return { queued, send, retry, discard, flush }
}
