import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { useNetworkState } from 'expo-network'
import React from 'react'
import { AppState } from 'react-native'
import { apiFetch } from '../lib/api-fetch'
import { invalidateChannelListQueries, invalidateOfflineReadQueries } from '../lib/channel-list-queries'
import { haptics } from '../lib/haptics'
import { shouldAttemptNetworkRequest } from '../lib/network-state'
import { isNetworkRecovery } from '../lib/offline-cache'
import {
  isRetryableSendError,
  parseStoredMessageQueue,
  messagesForWorkspace,
  pendingMessages,
  retryQueuedMessage,
  canRetryInWorkspace,
  resolveQueueWorkspace,
  queueRestoreControls,
  persistThenStartSend,
  sendQueuedForUser,
  type QueuedMessage,
} from '../lib/offline-message-queue'
import { useSession } from '../lib/session-context'
import { supabase } from '../lib/supabase'
import { useT } from './locale-provider'
import { useWorkspace } from '../hooks/use-account'
import { useSelectedWorkspaceId } from '../hooks/use-selected-workspace-id'
import { getSelectedWorkspaceId, subscribeSelectedWorkspace } from '../lib/workspace-selection'

interface QueueContextValue {
  ready: boolean
  restoreError: string | null
  messages: QueuedMessage[]
  retryRestore: () => void
  enqueue: (message: Omit<QueuedMessage, 'attempts' | 'status'>) => Promise<void>
  retry: (id: string) => Promise<void>
  cancel: (id: string) => void
}

const QueueContext = React.createContext<QueueContextValue | null>(null)
const CanUseNetworkContext = React.createContext(true)
const STORAGE_PREFIX = 'cairn:offline-message-queue:v1:'
const RETRY_INTERVAL_MS = 8_000

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function OfflineMessageQueueProvider({ children }: React.PropsWithChildren) {
  const t = useT()
  const session = useSession()
  const networkState = useNetworkState()
  const canUseNetwork = shouldAttemptNetworkRequest(networkState)
  const userId = session?.user.id
  const workspace = useWorkspace()
  const selectedWorkspace = useSelectedWorkspaceId(userId)
  const workspaceId = resolveQueueWorkspace(selectedWorkspace.ready, selectedWorkspace.workspaceId, workspace.data?.id)
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null
  const qc = useQueryClient()
  const selectionGenerationRef = React.useRef(0)
  React.useEffect(() => subscribeSelectedWorkspace((changedUserId) => {
    if (changedUserId === userId) selectionGenerationRef.current += 1
  }), [userId])
  const currentUserRef = React.useRef(userId)
  currentUserRef.current = userId
  const mountedRef = React.useRef(false)
  React.useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const [ready, setReady] = React.useState(false)
  const [restoreError, setRestoreError] = React.useState<string | null>(null)
  const [restoreNonce, setRestoreNonce] = React.useState(0)
  const [messages, setMessages] = React.useState<QueuedMessage[]>([])
  const messagesRef = React.useRef<QueuedMessage[]>([])
  const flushingRef = React.useRef(false)
  const persistenceRef = React.useRef<Promise<void>>(Promise.resolve())

  const updateMessages = React.useCallback(
    async (updater: (current: QueuedMessage[]) => QueuedMessage[]) => {
      const operation = persistenceRef.current
        .catch(() => undefined)
        .then(async () => {
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
    setRestoreError(null)
    messagesRef.current = []
    setMessages([])
    if (!storageKey) return
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return
        const restored = parseStoredMessageQueue(raw)
        messagesRef.current = restored
        setMessages(restored)
        setReady(true)
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[offline-message-queue] 端末保存の読み込みに失敗しました:', error)
        setRestoreError(t('Could not load unsent messages from this device'))
      })
    return () => {
      cancelled = true
    }
  }, [restoreNonce, storageKey])

  const flush = React.useCallback(async () => {
    if (!ready || !storageKey || !userId || !canUseNetwork || flushingRef.current) return
    const isCurrentAccount = () => mountedRef.current && currentUserRef.current === userId
    flushingRef.current = true
    // 復帰時にまとめて送ることがあるので、振動は1メッセージごとではなく1回の送信処理につき1度にする
    let sent = false
    let failed = false
    try {
      const pending = pendingMessages(messagesRef.current)
      for (const item of pending) {
        // pending を列挙した後にユーザーが取り消した項目は送信しない。
        if (!messagesRef.current.some((message) => message.id === item.id)) continue
        await updateMessages((current) =>
          current.map((message) =>
            message.id === item.id ? { ...message, status: 'sending' } : message,
          ),
        )
        if (!isCurrentAccount()) break
        try {
          const res = await sendQueuedForUser(userId, isCurrentAccount,
            async () => (await supabase.auth.getSession()).data.session,
            (sendSession) => apiFetch(`/api/channels/${item.channelId}/messages`, {
              method: 'POST',
              headers: { 'X-Cairn-Workspace-Id': item.workspaceId! },
              body: JSON.stringify({
                clientMessageId: item.id,
                content: item.content,
                ...(item.parentMessageId ? { parentMessageId: item.parentMessageId } : {}),
                ...(item.attachmentFileIds?.length
                  ? { attachmentFileIds: item.attachmentFileIds }
                  : {}),
              }),
            }, sendSession),
          )
          if (!res) {
            if (isCurrentAccount()) {
              await updateMessages((current) => current.map((message) =>
                message.id === item.id ? { ...message, status: 'waiting' } : message,
              ))
            }
            break
          }
          if (!res.ok) {
            const error = new Error(t('Could not send ({status})', { status: res.status })) as Error & {
              status: number
            }
            error.status = res.status
            throw error
          }
          await updateMessages((current) => current.filter((message) => message.id !== item.id))
          sent = true
          await qc.invalidateQueries({ queryKey: ['messages', item.channelId] })
          await invalidateChannelListQueries(qc)
        } catch (error) {
          const retryable = isRetryableSendError(error)
          await updateMessages((current) =>
            current.map((message) =>
              message.id === item.id
                ? {
                    ...message,
                    status: retryable ? 'waiting' : 'failed',
                    attempts: message.attempts + 1,
                    lastError: errorMessage(error, t('Could not send')),
                  }
                : message,
            ),
          )
          // 同じ回線で後続メッセージだけ成功すると順序が入れ替わるため、通信障害時はここで止める。
          // 自動で再送する通信障害は失敗として知らせない（圏外の間、再送のたびに振動してしまう）
          if (retryable) break
          failed = true
        }
      }
    } finally {
      flushingRef.current = false
    }
    if (failed) haptics.sendFailed()
    else if (sent) haptics.messageSent()
  }, [canUseNetwork, qc, ready, storageKey, t, updateMessages, userId])

  React.useEffect(() => {
    if (!ready) return
    if (canUseNetwork) void flush()
    const timer = setInterval(() => void flush(), RETRY_INTERVAL_MS)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush()
    })
    return () => {
      clearInterval(timer)
      appState.remove()
    }
  }, [canUseNetwork, flush, ready])

  // 圏外の間に取れなかった表示を、回線復帰と前面復帰で取り直す（タイマーでは取り直さない）。
  const wasOnlineRef = React.useRef(canUseNetwork)
  React.useEffect(() => {
    const wasOnline = wasOnlineRef.current
    wasOnlineRef.current = canUseNetwork
    if (isNetworkRecovery(wasOnline, canUseNetwork)) void invalidateOfflineReadQueries(qc)
  }, [canUseNetwork, qc])

  React.useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && wasOnlineRef.current) void invalidateOfflineReadQueries(qc)
    })
    return () => appState.remove()
  }, [qc])

  const value = React.useMemo<QueueContextValue>(
    () => {
      const restore = queueRestoreControls(
        restoreError, selectedWorkspace.error,
        t('Could not load the selected workspace for unsent messages'),
        () => setRestoreNonce((value) => value + 1), selectedWorkspace.retry,
      )
      return {
        ready: ready && !!workspaceId,
        restoreError: restore.error,
        messages: messagesForWorkspace(messages, workspaceId),
        retryRestore: restore.retry,
        enqueue: async (message) => {
          if (!userId || !workspaceId) throw new Error('Workspace is not available')
          const selected = await getSelectedWorkspaceId(userId)
          if (selected && selected !== workspaceId) throw new Error('Workspace changed')
          await persistThenStartSend(
            () =>
              updateMessages((current) => {
                if (current.some((queued) => queued.id === message.id)) return current
                return [...current, { ...message, workspaceId, attempts: 0, status: 'waiting' }]
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
        retry: async (id) => {
          if (!userId || !workspaceId) throw new Error('Workspace is not available')
          const generation = selectionGenerationRef.current
          const selected = await getSelectedWorkspaceId(userId)
          if (!canRetryInWorkspace(workspaceId, selected, generation, selectionGenerationRef.current)) throw new Error('Workspace changed')
          await updateMessages((current) => {
            if (!canRetryInWorkspace(workspaceId, selected, generation, selectionGenerationRef.current)) throw new Error('Workspace changed')
            return current.map((message) => message.id === id
              ? retryQueuedMessage(message, workspaceId) ?? message
              : message)
          })
          await flush()
        },
        cancel: (id) => {
          void updateMessages((current) => current.filter((message) => message.id !== id || !workspaceId || (!!message.workspaceId && message.workspaceId !== workspaceId))).catch(
            (error) => console.warn('[offline-message-queue] 取消の保存に失敗しました:', error),
          )
        },
      }
    },
    [flush, messages, ready, restoreError, selectedWorkspace.error, selectedWorkspace.retry, t, updateMessages, userId, workspaceId],
  )

  return (
    <CanUseNetworkContext.Provider value={canUseNetwork}>
      <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
    </CanUseNetworkContext.Provider>
  )
}

/** 明示的に圏外と判定できた間だけ false。起動直後の未確定は true */
export function useCanUseNetwork(): boolean {
  return React.useContext(CanUseNetworkContext)
}

export function useOfflineMessageQueue(): QueueContextValue {
  const value = React.useContext(QueueContext)
  if (!value) throw new Error('useOfflineMessageQueue must be used within its provider')
  return value
}
