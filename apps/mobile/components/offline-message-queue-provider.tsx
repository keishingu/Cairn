import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { AppState } from 'react-native'
import { apiFetch } from '../lib/api-fetch'
import {
  isRetryableSendError,
  parseStoredMessageQueue,
  persistThenStartSend,
  type QueuedMessage,
} from '../lib/offline-message-queue'
import { useSession } from '../lib/session-context'

interface QueueContextValue {
  ready: boolean
  messages: QueuedMessage[]
  enqueue: (message: Omit<QueuedMessage, 'attempts' | 'status'>) => Promise<void>
  retry: (id: string) => void
  cancel: (id: string) => void
}

const QueueContext = React.createContext<QueueContextValue | null>(null)
const STORAGE_PREFIX = 'cairn:offline-message-queue:v1:'
const RETRY_INTERVAL_MS = 8_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '送信できませんでした'
}

export function OfflineMessageQueueProvider({ children }: React.PropsWithChildren) {
  const session = useSession()
  const userId = session?.user.id
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null
  const qc = useQueryClient()
  const [ready, setReady] = React.useState(false)
  const [messages, setMessages] = React.useState<QueuedMessage[]>([])
  const messagesRef = React.useRef<QueuedMessage[]>([])
  const flushingRef = React.useRef(false)
  const persistenceRef = React.useRef<Promise<void>>(Promise.resolve())

  const updateMessages = React.useCallback(
    async (updater: (current: QueuedMessage[]) => QueuedMessage[]) => {
      const operation = persistenceRef.current.catch(() => undefined).then(async () => {
        // 更新処理自体を直列化し、再送中の enqueue / retry / cancel が古い配列で
        // 新しいメッセージを上書きしないよう、実行直前の最新状態から next を作る。
        const next = updater(messagesRef.current)
        if (storageKey) await AsyncStorage.setItem(storageKey, JSON.stringify(next))
        // 永続化できる前に「電波待ち」と表示すると、直後のアプリ終了で本文が失われる。
        // 端末保存の成功を待ってから、画面と自動再送対象へ反映する。
        messagesRef.current = next
        setMessages(next)
      })
      persistenceRef.current = operation
      await operation
    },
    [storageKey],
  )

  React.useEffect(() => {
    let cancelled = false
    setReady(false)
    messagesRef.current = []
    setMessages([])
    if (!storageKey) return
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return
      const restored = parseStoredMessageQueue(raw)
      messagesRef.current = restored
      setMessages(restored)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [storageKey])

  const flush = React.useCallback(async () => {
    if (!ready || !storageKey || flushingRef.current) return
    flushingRef.current = true
    try {
      const pending = messagesRef.current.filter((message) => message.status === 'waiting')
      for (const item of pending) {
        // pending を列挙した後にユーザーが取り消した項目は送信しない。
        if (!messagesRef.current.some((message) => message.id === item.id)) continue
        await updateMessages((current) =>
          current.map((message) =>
            message.id === item.id ? { ...message, status: 'sending' } : message,
          ),
        )
        try {
          const res = await apiFetch(`/api/channels/${item.channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              clientMessageId: item.id,
              content: item.content,
              ...(item.parentMessageId ? { parentMessageId: item.parentMessageId } : {}),
              ...(item.attachmentFileIds?.length
                ? { attachmentFileIds: item.attachmentFileIds }
                : {}),
            }),
          })
          if (!res.ok) {
            const error = new Error(`送信に失敗しました (${res.status})`) as Error & {
              status: number
            }
            error.status = res.status
            throw error
          }
          await updateMessages((current) => current.filter((message) => message.id !== item.id))
          await qc.invalidateQueries({ queryKey: ['messages', item.channelId] })
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['project-channels'] }),
            qc.invalidateQueries({ queryKey: ['workspace-channels'] }),
            qc.invalidateQueries({ queryKey: ['workspace-dms'] }),
          ])
        } catch (error) {
          const retryable = isRetryableSendError(error)
          await updateMessages((current) =>
            current.map((message) =>
              message.id === item.id
                ? {
                    ...message,
                    status: retryable ? 'waiting' : 'failed',
                    attempts: message.attempts + 1,
                    lastError: errorMessage(error),
                  }
                : message,
            ),
          )
          // 同じ回線で後続メッセージだけ成功すると順序が入れ替わるため、通信障害時はここで止める。
          if (retryable) break
        }
      }
    } finally {
      flushingRef.current = false
    }
  }, [qc, ready, storageKey, updateMessages])

  React.useEffect(() => {
    if (!ready) return
    void flush()
    const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush()
    })
    return () => {
      clearInterval(timer)
      appState.remove()
    }
  }, [flush, ready])

  const value = React.useMemo<QueueContextValue>(
    () => ({
      ready,
      messages,
      enqueue: async (message) => {
        await persistThenStartSend(
          () =>
            updateMessages((current) => {
              if (current.some((queued) => queued.id === message.id)) return current
              return [...current, { ...message, attempts: 0, status: 'waiting' }]
            }),
          () => {
            // 端末保存の完了後にだけネットワーク送信を始める。呼び出し元は保存完了時点で
            // 下書きを安全に消せるよう、POST完了を待たずに戻す。
            void flush().catch((error) =>
              console.warn('[offline-message-queue] 自動送信の開始に失敗しました:', error),
            )
          },
        )
      },
      retry: (id) => {
        void (async () => {
          await updateMessages((current) =>
            current.map((message) => {
              if (message.id !== id) return message
              const { lastError: _lastError, ...rest } = message
              return { ...rest, status: 'waiting' }
            }),
          )
          await flush()
        })().catch((error) => console.warn('[offline-message-queue] 再送準備に失敗しました:', error))
      },
      cancel: (id) => {
        void updateMessages((current) => current.filter((message) => message.id !== id)).catch(
          (error) => console.warn('[offline-message-queue] 取消の保存に失敗しました:', error),
        )
      },
    }),
    [flush, messages, ready, updateMessages],
  )

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
}

export function useOfflineMessageQueue(): QueueContextValue {
  const value = React.useContext(QueueContext)
  if (!value) throw new Error('useOfflineMessageQueue must be used within its provider')
  return value
}
