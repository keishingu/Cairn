// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createActiveChannelRegistry,
  planChannelActivityRefresh,
  realtimePayloadTable,
} from '@cairn/shared'
import { createClient } from '@/lib/supabase/client'
import { chatQueryKeys } from '@/lib/chat/client'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isRealtimeUnauthorized } from '@/lib/realtime-unauthorized'
import { RealtimeIndicator } from './realtime-indicator'
import { ActiveChannelContext } from './use-realtime-channel'
import { projectQueryKeys } from '@/hooks/use-projects'
import { setRealtimeFocusCatchUp } from '@/lib/realtime-focus'
import { BROADCAST_COVERED_QUERY_KEYS, coveredMessagesQueryKey } from '@/lib/realtime-coverage'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected'

interface RealtimeContextValue {
  status: RealtimeStatus
  // 一定時間（DEGRADED_DELAY_MS）復帰できない切断状態。UI で「再接続中…」表示に使う
  degraded: boolean
}

const RealtimeContext = React.createContext<RealtimeContextValue>({
  status: 'connecting',
  degraded: false,
})

export const useRealtime = () => React.useContext(RealtimeContext)


// 切断インジケータを出すまでの猶予。瞬断でのちらつきを避ける
const DEGRADED_DELAY_MS = 10_000
// チャンネル一覧の invalidate をまとめるデバウンス。連続する新着での過剰な再取得を抑える
const LIST_DEBOUNCE_MS = 800
// タスク一覧の invalidate をまとめるデバウンス。一括操作で複数の文が続いても1回にする
const TASKS_DEBOUNCE_MS = 300

const CHANNEL_LIST_KEYS = [
  chatQueryKeys.projectChannels,
  chatQueryKeys.workspaceChannels,
  chatQueryKeys.dms,
  projectQueryKeys.all,
] as const

function invalidateChannelLists(queryClient: QueryClient) {
  for (const key of CHANNEL_LIST_KEYS) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

// ペイロードはシグナル用途。table（と user トピックでは channel_ids）だけを読み、データは既存 REST API で再取得する
function tableOf(payload: unknown): string | undefined {
  return realtimePayloadTable(payload)
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const userId = currentUser?.id ?? null

  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')
  const [degraded, setDegraded] = React.useState(false)

  // 購読するチャンネルトピックは表示中のチャットだけ（useRealtimeChannel が登録する）。
  // チャンネル一覧から決めると購読数がチャンネル総数に比例し、Realtime の上限に当たる
  const [registry] = React.useState(createActiveChannelRegistry)
  React.useEffect(() => () => registry.dispose(), [registry])
  const activeChannelIdsKey = React.useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  // SUBSCRIBED 済みの channel トピック。届いている間は user トピック側でメッセージを再取得しない（二重取得を避ける）
  const joinedChannelIdsRef = React.useRef(new Set<string>())

  // status が disconnected に留まった時だけ degraded を立てる
  React.useEffect(() => {
    setRealtimeFocusCatchUp(status !== 'connected')
    return () => setRealtimeFocusCatchUp(true)
  }, [status])

  React.useEffect(() => {
    if (status === 'connecting') {
      setDegraded(false)
      return
    }
    if (status === 'connected') {
      setDegraded(false)
      return
    }
    const timer = setTimeout(() => setDegraded(true), DEGRADED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status])

  const listTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleListInvalidate = React.useCallback(() => {
    if (listTimerRef.current) clearTimeout(listTimerRef.current)
    listTimerRef.current = setTimeout(() => invalidateChannelLists(queryClient), LIST_DEBOUNCE_MS)
  }, [queryClient])

  const tasksTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleTasksInvalidate = React.useCallback(() => {
    if (tasksTimerRef.current) clearTimeout(tasksTimerRef.current)
    tasksTimerRef.current = setTimeout(() => {
      tasksTimerRef.current = null
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }, TASKS_DEBOUNCE_MS)
  }, [queryClient])

  // ─── ユーザートピック（notifications / channel_read_states / channel_members / チャンネル活動）────
  React.useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    let cancelled = false
    let userChannel: RealtimeChannel | null = null

    const removeUserChannel = async (channel: RealtimeChannel) => {
      if (userChannel === channel) {
        userChannel = null
      }
      await supabase.removeChannel(channel)
    }

    const connectUserChannel = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return

      const token = data.session?.access_token
      if (token) await supabase.realtime.setAuth(token)
      if (cancelled) return

      const currentChannel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const payload = (message as { payload?: unknown }).payload
          const table = tableOf(payload)
          const activity = planChannelActivityRefresh(payload, joinedChannelIdsRef.current)
          if (activity) {
            // 画面外のチャンネルの新着・削除・スレッドへの移動（移動元と移動先）とタスク。本文は届かない。
            // 表示していないチャンネルは古い扱いにするだけで通信せず、表示中で JOIN 待ちなら再取得する
            if (activity.channelLists) scheduleListInvalidate()
            if (activity.tasks) scheduleTasksInvalidate()
            for (const id of activity.messageChannelIds) {
              void queryClient.invalidateQueries({ queryKey: coveredMessagesQueryKey(id) })
            }
            for (const id of activity.fileChannelIds) {
              void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
            }
          } else if (table === 'notifications') {
            void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.notifications })
            // 新規DM・未参加チャンネルでの活動はチャンネル一覧の再取得で拾う
            scheduleListInvalidate()
          } else if (table === 'app_views') {
            // アプリが本人にモーダルを開いた・差し替えた・閉じた
            void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.appViews })
          } else if (table === 'ai_nudges') {
            // INSERT（新規）と UPDATE（resolve / feedback / 再 active 化）の双方を反映する。
            void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.aiNudges })
          } else if (table === 'channel_read_states') {
            // 他デバイスでの既読を即時反映（バッジ消去 + ベルの既読同期）
            scheduleListInvalidate()
            void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.notifications })
          } else if (table === 'channel_members') {
            // 非公開チャンネルの参加は一覧フィルタの正。既読行の有無に依存させない
            scheduleListInvalidate()
          } else if (table === 'channels') {
            // 名称変更と削除。削除後は channel トピックの認可が消えるため、ここへ届ける。
            scheduleListInvalidate()
            const operation = (message as { payload?: { operation?: unknown } }).payload?.operation
            if (operation === 'DELETE') {
              void queryClient.invalidateQueries({ queryKey: ['tasks'] })
              void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.notifications })
            }
          }
        })
      userChannel = currentChannel

      currentChannel.subscribe((subStatus, err) => {
        if (cancelled || currentChannel !== userChannel) return
        if (subStatus === 'SUBSCRIBED') {
          // デプロイにRealtimeコードが入っているか・接続できているかを判別できるよう成功も1行出す
          console.info('[Realtime] connected')
          setStatus('connected')
          // (再)接続直後に一括 invalidate して切断中の取りこぼしを回収する
          void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.messages })
          void queryClient.invalidateQueries({ queryKey: ['tasks'] })
          void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.notifications })
          void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.aiNudges })
          // アプリのモーダルも Broadcast だけで知るので、切断中の views.open・差し替え・閉じるを取り直す
          void queryClient.invalidateQueries({ queryKey: BROADCAST_COVERED_QUERY_KEYS.appViews })
          invalidateChannelLists(queryClient)
          return
        }

        // CHANNEL_ERROR はソケット切断後の通常ライフサイクル。removeChannel すると
        // supabase-js の自動再 JOIN を潰すので再接続はライブラリに任せる。
        // ただし status を connected のままにすると、JOIN が TIMED_OUT しない長時間切断で
        // バナーが出ない。disconnected にして 10 秒後に表示し、SUBSCRIBED で消す。
        if (subStatus === 'CHANNEL_ERROR') {
          console.warn('[Realtime] subscription interrupted:', subStatus, err?.message ?? err)
          setStatus('disconnected')
          return
        }

        // CLOSED は Phoenix がチャンネルを外した終端状態。同じインスタンスは再 JOIN されない。
        // バナーは出さず、新しい購読だけ作り直す。
        if (subStatus === 'CLOSED') {
          console.warn('[Realtime] subscription closed, recreating:', err?.message ?? err)
          void (async () => {
            if (cancelled || currentChannel !== userChannel) return
            await removeUserChannel(currentChannel)
            if (cancelled) return
            await connectUserChannel()
          })()
          return
        }

        if (subStatus === 'TIMED_OUT') {
          console.error('[Realtime] subscription failed:', subStatus, err?.message ?? err)
          setStatus('disconnected')
        }
      })
    }

    // private channel の認可（realtime.messages の RLS）のため、購読前に JWT を Realtime に渡す。
    // setAuth は非同期。await せずに subscribe すると JOIN が認証前トークンで送られ、
    // 「Unauthorized: ... Channel topic」で CHANNEL_ERROR になるため必ず待つ
    void connectUserChannel()

    // トークンリフレッシュ時に Realtime の認証も更新（長時間セッションでの失効対策）
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      authSub.subscription.unsubscribe()
      if (userChannel) void removeUserChannel(userChannel)
    }
  }, [queryClient, userId, scheduleListInvalidate, scheduleTasksInvalidate])

  // ─── チャンネルトピック（表示中のチャットだけ。messages / message_reactions / message_blocks / tasks）──
  // 表示中のチャットの変化に追従して join/leave を差分反映する
  const topicChannelsRef = React.useRef<Map<string, RealtimeChannel>>(new Map())

  React.useEffect(() => {
    // setAuth 完了前の join は認可で弾かれるため、ユーザートピック接続後にのみ join する
    if (!userId || status !== 'connected') return

    const supabase = createClient()
    const current = topicChannelsRef.current
    const joined = joinedChannelIdsRef.current
    const wanted = new Set(activeChannelIdsKey ? activeChannelIdsKey.split(',') : [])

    for (const [id, ch] of [...current]) {
      if (!wanted.has(id)) {
        void supabase.removeChannel(ch)
        current.delete(id)
        joined.delete(id)
        // 購読をやめた後の編集・リアクションは届かない。次に開いたときに取り直すよう古い扱いにする
        void queryClient.invalidateQueries({ queryKey: coveredMessagesQueryKey(id), refetchType: 'none' })
        void queryClient.invalidateQueries({ queryKey: ['channel-files', id], refetchType: 'none' })
      }
    }

    for (const id of wanted) {
      if (current.has(id)) continue
      const ch = supabase
        .channel(`channel:${id}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const table = tableOf((message as { payload?: unknown }).payload)
          // 一覧（未読数）とタスク一覧は user トピックで更新する。ここでは表示中のメッセージだけを取り直す
          if (table === 'messages') {
            void queryClient.invalidateQueries({ queryKey: coveredMessagesQueryKey(id) })
            // 添付ファイル・Google Docs リンクの有無はペイロードから判別できないため、
            // 新着メッセージのたびに無効化して他クライアントのアップロードも反映する
            void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
          } else if (table === 'message_reactions' || table === 'message_blocks' || table === 'tasks') {
            // message_blocks はアプリがカードを更新した（chat.update）とき。messages は動かないためここで拾う。
            // tasks はタスク化済みの印（メッセージの linkedTasks）の完了・削除
            void queryClient.invalidateQueries({ queryKey: coveredMessagesQueryKey(id) })
          }
        })
      ch.subscribe((subStatus, err) => {
        if (current.get(id) !== ch) return
        if (subStatus === 'SUBSCRIBED') {
          joined.add(id)
          // 表示開始から JOIN 完了まで・再接続までの間の変化を取り直す
          void queryClient.invalidateQueries({ queryKey: coveredMessagesQueryKey(id) })
          void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
          return
        }
        // JOIN できていない間は user トピックの通知で表示中のメッセージを再取得する
        joined.delete(id)
        if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          console.error(`[Realtime] channel:${id} subscription failed:`, subStatus, err?.message ?? err)
          // 未参加の非公開チャンネルは何回 JOIN しても直らない。ライブラリの再 JOIN を止める。
          if (isRealtimeUnauthorized(err)) {
            void supabase.removeChannel(ch)
            current.delete(id)
          }
        }
      })
      current.set(id, ch)
    }
  }, [activeChannelIdsKey, userId, status, queryClient])

  // アンマウント時に全チャンネルトピックを解放
  React.useEffect(() => {
    const topicChannels = topicChannelsRef.current
    const joined = joinedChannelIdsRef.current
    return () => {
      const supabase = createClient()
      if (listTimerRef.current) clearTimeout(listTimerRef.current)
      if (tasksTimerRef.current) clearTimeout(tasksTimerRef.current)
      for (const ch of topicChannels.values()) void supabase.removeChannel(ch)
      topicChannels.clear()
      joined.clear()
    }
  }, [])

  return (
    <ActiveChannelContext.Provider value={registry}>
      <RealtimeContext.Provider value={{ status, degraded }}>
        {children}
        <RealtimeIndicator />
      </RealtimeContext.Provider>
    </ActiveChannelContext.Provider>
  )
}
