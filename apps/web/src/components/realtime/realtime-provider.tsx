// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  chatQueryKeys,
  useCurrentUser,
  useProjectChannels,
  useWorkspaceChannels,
  useWorkspaceDms,
} from '@/lib/chat/client'
import { RealtimeIndicator } from './realtime-indicator'

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
const RETRY_DELAY_MS = 3_000
// チャンネル一覧の invalidate をまとめるデバウンス。連続する新着での過剰な再取得を抑える
const LIST_DEBOUNCE_MS = 800

const CHANNEL_LIST_KEYS = [
  chatQueryKeys.projectChannels,
  chatQueryKeys.workspaceChannels,
  chatQueryKeys.dms,
] as const

function invalidateChannelLists(queryClient: QueryClient) {
  for (const key of CHANNEL_LIST_KEYS) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

// realtime.broadcast_changes() が送るペイロード（{ table, record, ... }）から table を取り出す。
// シグナル用途のため record は読まず、既存 REST API の再取得に任せる
function tableOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const table = (payload as { table?: unknown }).table
  return typeof table === 'string' ? table : undefined
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const userId = currentUser?.id ?? null

  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')
  const [degraded, setDegraded] = React.useState(false)

  // 購読すべきチャンネルトピックの決定にチャンネル一覧を使う（サイドバーと同じクエリを共有）
  const { data: projectChannels = [] } = useProjectChannels()
  const { data: workspaceChannels = [] } = useWorkspaceChannels()
  const { data: dms = [] } = useWorkspaceDms()
  const channelIdsKey = React.useMemo(() => {
    const ids = new Set<string>()
    for (const c of projectChannels) ids.add(c.channelId)
    for (const c of workspaceChannels) ids.add(c.id)
    for (const d of dms) ids.add(d.id)
    return [...ids].sort().join(',')
  }, [projectChannels, workspaceChannels, dms])

  // status が disconnected に留まった時だけ degraded を立てる
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

  // ─── ユーザートピック（notifications / channel_read_states）────
  React.useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    let cancelled = false
    let userChannel: RealtimeChannel | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

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
          const table = tableOf((message as { payload?: unknown }).payload)
          if (table === 'notifications') {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] })
            // 新規DM・未参加チャンネルでの活動はチャンネル一覧の再取得で拾う
            scheduleListInvalidate()
          } else if (table === 'channel_read_states') {
            // 他デバイスでの既読を即時反映（バッジ消去 + ベルの既読同期）
            scheduleListInvalidate()
            void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          }
        })
      userChannel = currentChannel

      currentChannel.subscribe((subStatus, err) => {
        if (cancelled || currentChannel !== userChannel) return
        if (subStatus === 'SUBSCRIBED') {
          clearRetryTimer()
          // デプロイにRealtimeコードが入っているか・接続できているかを判別できるよう成功も1行出す
          console.info('[Realtime] connected')
          setStatus('connected')
          // (再)接続直後に一括 invalidate して切断中の取りこぼしを回収する
          void queryClient.invalidateQueries({ queryKey: ['messages'] })
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          invalidateChannelLists(queryClient)
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
          // 購読失敗の原因（認可ポリシー・トークン等）を隠さない
          console.error('[Realtime] subscription failed:', subStatus, err?.message ?? err)
          setStatus('disconnected')
          void (async () => {
            await removeUserChannel(currentChannel)
            if (cancelled || retryTimer) return
            retryTimer = setTimeout(() => {
              retryTimer = null
              void connectUserChannel()
            }, RETRY_DELAY_MS)
          })()
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
      clearRetryTimer()
      authSub.subscription.unsubscribe()
      if (userChannel) void removeUserChannel(userChannel)
    }
  }, [queryClient, userId, scheduleListInvalidate])

  // ─── チャンネルトピック（messages / message_reactions）─────────
  // 一覧の変化に追従して join/leave を差分反映する
  const topicChannelsRef = React.useRef<Map<string, RealtimeChannel>>(new Map())

  React.useEffect(() => {
    // setAuth 完了前の join は認可で弾かれるため、ユーザートピック接続後にのみ join する
    if (!userId || status !== 'connected') return

    const supabase = createClient()
    const current = topicChannelsRef.current
    const wanted = new Set(channelIdsKey ? channelIdsKey.split(',') : [])

    for (const [id, ch] of [...current]) {
      if (!wanted.has(id)) {
        void supabase.removeChannel(ch)
        current.delete(id)
      }
    }

    for (const id of wanted) {
      if (current.has(id)) continue
      const ch = supabase
        .channel(`channel:${id}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const table = tableOf((message as { payload?: unknown }).payload)
          if (table === 'messages') {
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(id) })
            // 添付ファイル・Google Docs リンクの有無はペイロードから判別できないため、
            // 新着メッセージのたびに無効化して他クライアントのアップロードも反映する
            void queryClient.invalidateQueries({ queryKey: ['channel-files', id] })
            scheduleListInvalidate()
          } else if (table === 'poll_votes') {
            void queryClient.invalidateQueries({ queryKey: ['poll'] })
          } else if (table === 'message_reactions') {
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(id) })
          }
        })
      ch.subscribe((subStatus, err) => {
        if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          console.error(`[Realtime] channel:${id} subscription failed:`, subStatus, err?.message ?? err)
        }
      })
      current.set(id, ch)
    }
  }, [channelIdsKey, userId, status, queryClient, scheduleListInvalidate])

  // アンマウント時に全チャンネルトピックを解放
  React.useEffect(() => {
    const topicChannels = topicChannelsRef.current
    return () => {
      const supabase = createClient()
      if (listTimerRef.current) clearTimeout(listTimerRef.current)
      for (const ch of topicChannels.values()) void supabase.removeChannel(ch)
      topicChannels.clear()
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ status, degraded }}>
      {children}
      <RealtimeIndicator />
    </RealtimeContext.Provider>
  )
}
