import React from 'react'
import { AppState } from 'react-native'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import {
  createActiveChannelRegistry,
  planChannelActivityRefresh,
  realtimePayloadTable,
  type ActiveChannelRegistry,
} from '@cairn/shared'
import { useMe } from '../hooks/use-account'
import { invalidateChannelListQueries } from '../lib/channel-list-queries'
import { isRealtimeUnauthorized, shouldRetryRealtime } from '../lib/mobile-chat-state'
import { supabase } from '../lib/supabase'
import { reconcileRealtimeSubscriptions } from '../lib/realtime-subscriptions'

// 連続する通知（一括操作・新着の連投）での再取得をまとめる
const LIST_DEBOUNCE_MS = 800
const TASKS_DEBOUNCE_MS = 800

const ActiveChannelContext = React.createContext<ActiveChannelRegistry | null>(null)

/**
 * チャットを表示している間だけ channel:{id} を購読する。
 * 常時購読は user:{me} だけで、画面外のチャンネルの新着・削除・移動・タスクは user トピックで届く（#173）
 */
export function useRealtimeChannel(channelId: string | null) {
  const registry = React.useContext(ActiveChannelContext)
  React.useEffect(() => {
    if (!registry || !channelId) return
    return registry.acquire(channelId)
  }, [registry, channelId])
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const [authenticated, setAuthenticated] = React.useState(false)
  const [retryNonce, setRetryNonce] = React.useState(0)

  // 購読するチャンネルトピックは表示中のチャットだけ。チャンネル一覧から決めると購読数が
  // チャンネル総数に比例し、Realtime の1接続あたりのチャンネル数上限に当たる
  const [registry] = React.useState(createActiveChannelRegistry)
  React.useEffect(() => () => registry.dispose(), [registry])
  const activeChannelIdsKey = React.useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  // SUBSCRIBED 済みの channel トピック。届いている間は user トピック側でメッセージを再取得しない
  const joinedChannelIdsRef = React.useRef(new Set<string>())

  const listTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleListInvalidate = React.useCallback(() => {
    if (listTimerRef.current) clearTimeout(listTimerRef.current)
    listTimerRef.current = setTimeout(() => {
      listTimerRef.current = null
      void invalidateChannelListQueries(queryClient)
    }, LIST_DEBOUNCE_MS)
  }, [queryClient])

  const tasksTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleTasksInvalidate = React.useCallback(() => {
    if (tasksTimerRef.current) clearTimeout(tasksTimerRef.current)
    tasksTimerRef.current = setTimeout(() => {
      tasksTimerRef.current = null
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }, TASKS_DEBOUNCE_MS)
  }, [queryClient])

  React.useEffect(() => {
    if (!me?.id) return
    let cancelled = false
    let userChannel: RealtimeChannel | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session?.access_token) return
      await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return

      userChannel = supabase
        .channel(`user:${me.id}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const payload = (message as { payload?: unknown }).payload
          const table = realtimePayloadTable(payload)
          // 画面外のチャンネルの新着・削除・スレッドへの移動（移動元と移動先）とタスク。本文は届かない。
          // 表示していないチャンネルは古い扱いにするだけで通信せず、表示中で JOIN 待ちなら再取得する
          const activity = planChannelActivityRefresh(payload, joinedChannelIdsRef.current)
          if (activity) {
            if (activity.channelLists) scheduleListInvalidate()
            if (activity.tasks) scheduleTasksInvalidate()
            for (const id of activity.messageChannelIds) {
              void queryClient.invalidateQueries({ queryKey: ['messages', id] })
            }
            for (const id of activity.fileChannelIds) {
              void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
            }
            return
          }
          // アプリが本人にモーダルを開いた・差し替えた・閉じた
          if (table === 'app_views') void queryClient.invalidateQueries({ queryKey: ['app-views'] })
          if (
            table === 'notifications' ||
            table === 'channel_read_states' ||
            table === 'channel_members' ||
            table === 'channels'
          ) {
            void invalidateChannelListQueries(queryClient)
            if (table === 'notifications' || table === 'channel_read_states') {
              void queryClient.invalidateQueries({ queryKey: ['notifications'] })
            }
            if (table === 'channels') {
              const operation = (message as { payload?: { operation?: unknown } }).payload?.operation
              if (operation === 'DELETE') {
                void queryClient.invalidateQueries({ queryKey: ['tasks'] })
                void queryClient.invalidateQueries({ queryKey: ['notifications'] })
              }
            }
          }
        })
      userChannel.subscribe((status, error) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setAuthenticated(true)
          void invalidateChannelListQueries(queryClient)
          // 切断中の既読・新着を取り直す。背景から戻った直後の再取得は再接続より先に走りうる
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          void queryClient.invalidateQueries({ queryKey: ['tasks'] })
          // 画面外のチャンネルのメッセージも切断中は届かないため古い扱いにする（表示中は channel トピックの JOIN で取り直す）
          void queryClient.invalidateQueries({ queryKey: ['messages'], refetchType: 'none' })
          // アプリのモーダルは Broadcast だけで知るので、切断中の views.open・差し替え・閉じるを取り直す
          void queryClient.invalidateQueries({ queryKey: ['app-views'] })
        } else if (shouldRetryRealtime(status, error)) {
          setAuthenticated(false)
          console.warn(
            '[Realtime] ユーザートピックを再接続します:',
            status,
            error?.message ?? error,
          )
          if (!retryTimer) {
            retryTimer = setTimeout(() => setRetryNonce((value) => value + 1), 5_000)
          }
        }
      })
    })()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      setAuthenticated(false)
      authSubscription.subscription.unsubscribe()
      if (retryTimer) clearTimeout(retryTimer)
      if (userChannel) void supabase.removeChannel(userChannel)
    }
  }, [me?.id, queryClient, retryNonce, scheduleListInvalidate, scheduleTasksInvalidate])

  // バックグラウンド中は OS がソケットを止めることがあり、再接続の SUBSCRIBED より先に画面が使われうる。
  // 前面に戻ったら一覧・通知・タスクと表示中のチャットを取り直す
  React.useEffect(() => {
    let previous = AppState.currentState
    const subscription = AppState.addEventListener('change', (next) => {
      const resumed = previous !== 'active' && next === 'active'
      previous = next
      if (!resumed || !me?.id) return
      void invalidateChannelListQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      for (const id of registry.getSnapshot().split(',').filter(Boolean)) {
        void queryClient.invalidateQueries({ queryKey: ['messages', id] })
        void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
      }
    })
    return () => subscription.remove()
  }, [me?.id, queryClient, registry])

  const subscriptionsRef = React.useRef(new Map<string, RealtimeChannel>())

  React.useEffect(() => {
    const subscriptions = subscriptionsRef.current
    const joined = joinedChannelIdsRef.current
    const wanted = new Set(authenticated && activeChannelIdsKey ? activeChannelIdsKey.split(',') : [])
    reconcileRealtimeSubscriptions(subscriptions, wanted, (channelId) => {
      const channel = supabase
        .channel(`channel:${channelId}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const table = realtimePayloadTable((message as { payload?: unknown }).payload)
          // 一覧（未読数）とタスク一覧は user トピックで更新する。ここでは表示中のメッセージだけを取り直す。
          // tasks はタスク化済みの印（メッセージの linkedTasks）の更新に使う。
          // message_blocks はアプリがカードを更新した（chat.update）とき。messages は動かないためここで拾う
          if (table === 'messages' || table === 'message_reactions' || table === 'tasks' || table === 'message_blocks') {
            void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
          }
          // チャット情報のファイル一覧。添付はメッセージと一緒に増える
          if (table === 'messages') void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
        })
      return channel
    }, (channel, channelId) => {
      joined.delete(channelId)
      void supabase.removeChannel(channel)
      // 購読をやめた後の編集・リアクションは届かない。次に開いたときに取り直すよう古い扱いにする
      void queryClient.invalidateQueries({ queryKey: ['messages', channelId], refetchType: 'none' })
      void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId], refetchType: 'none' })
    }, (channel, channelId) => {
      channel.subscribe((status, error) => {
        if (subscriptions.get(channelId) !== channel) return
        if (status === 'SUBSCRIBED') {
          joined.add(channelId)
          // 表示開始から JOIN 完了まで・再接続までの間の変化を取り直す
          void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
          void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
          return
        }
        // JOIN できていない間は user トピックの通知で表示中のメッセージを再取得する
        joined.delete(channelId)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] channel:${channelId} の購読に失敗しました:`, status, error?.message ?? error)
        }
        if (isRealtimeUnauthorized(error)) {
          console.warn(
            `[Realtime] channel:${channelId} の購読を取り下げます:`,
            status,
            error?.message ?? error,
          )
          subscriptions.delete(channelId)
          void supabase.removeChannel(channel)
        }
      })
    })
  }, [authenticated, activeChannelIdsKey, queryClient])

  React.useEffect(() => {
    const subscriptions = subscriptionsRef.current
    const joined = joinedChannelIdsRef.current
    return () => {
      if (listTimerRef.current) clearTimeout(listTimerRef.current)
      if (tasksTimerRef.current) clearTimeout(tasksTimerRef.current)
      for (const channel of subscriptions.values()) void supabase.removeChannel(channel)
      subscriptions.clear()
      joined.clear()
    }
  }, [])

  return <ActiveChannelContext.Provider value={registry}>{children}</ActiveChannelContext.Provider>
}
