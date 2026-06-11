// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { chatQueryKeys, useCurrentUser } from '@/lib/chat/client'
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

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const userId = currentUser?.id ?? null

  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')
  const [degraded, setDegraded] = React.useState(false)

  // status が disconnected に留まった時だけ degraded を立てる
  React.useEffect(() => {
    if (status === 'connected') {
      setDegraded(false)
      return
    }
    const timer = setTimeout(() => setDegraded(true), DEGRADED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status])

  React.useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    let listTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const scheduleListInvalidate = () => {
      if (listTimer) clearTimeout(listTimer)
      listTimer = setTimeout(() => invalidateChannelLists(queryClient), LIST_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('app-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const channelId = (payload.new as { channel_id?: string }).channel_id
          if (channelId) void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
          scheduleListInvalidate()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          // 編集・ソフトデリート（deleted_at）は UPDATE として届く
          const channelId = (payload.new as { channel_id?: string }).channel_id
          if (channelId) void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
          scheduleListInvalidate()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => {
          // reactions 行は channel_id を持たないため、表示中の messages クエリをまとめて invalidate
          void queryClient.invalidateQueries({ queryKey: ['messages'] })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channel_read_states', filter: `user_id=eq.${userId}` },
        () => {
          // 他デバイスでの既読を即時反映（バッジ消去 + ベルの既読同期）
          scheduleListInvalidate()
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
      )

    const subscribe = () => {
      channel.subscribe((subStatus, err) => {
        if (cancelled) return
        if (subStatus === 'SUBSCRIBED') {
          // デプロイにRealtimeコードが入っているか・接続できているかを判別できるよう成功も1行出す
          console.info('[Realtime] connected')
          setStatus('connected')
          // (再)接続直後に一括 invalidate して切断中の取りこぼしを回収する
          void queryClient.invalidateQueries({ queryKey: ['messages'] })
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          invalidateChannelLists(queryClient)
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
          // 購読失敗の原因（publication 未登録・RLS 拒否等）を隠さない
          console.error('[Realtime] subscription failed:', subStatus, err?.message ?? err)
          setStatus('disconnected')
        }
      })
    }

    // RLS 評価のため、購読前に現在の JWT を Realtime に渡す
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) supabase.realtime.setAuth(token)
      subscribe()
    })

    // トークンリフレッシュ時に Realtime の認証も更新（長時間セッションでの失効対策）
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      if (listTimer) clearTimeout(listTimer)
      authSub.subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [queryClient, userId])

  return (
    <RealtimeContext.Provider value={{ status, degraded }}>
      {children}
      <RealtimeIndicator />
    </RealtimeContext.Provider>
  )
}
