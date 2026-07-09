// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
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

type VisibleRealtimeChannelsContextValue = {
  registerVisibleChannel: (channelId: string) => () => void
}

const VisibleRealtimeChannelsContext = React.createContext<VisibleRealtimeChannelsContextValue | null>(null)

export const useRealtime = () => React.useContext(RealtimeContext)
export function useVisibleRealtimeChannel(channelId: string | null, enabled = true) {
  const context = React.useContext(VisibleRealtimeChannelsContext)
  React.useEffect(() => {
    if (!context || !channelId || !enabled) return
    return context.registerVisibleChannel(channelId)
  }, [channelId, context, enabled])
}

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

function channelIdOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const data = payload as {
    record?: { channel_id?: unknown } | null
    old_record?: { channel_id?: unknown } | null
  }
  const recordChannelId = data.record?.channel_id
  if (typeof recordChannelId === 'string' && recordChannelId.length > 0) return recordChannelId
  const oldRecordChannelId = data.old_record?.channel_id
  if (typeof oldRecordChannelId === 'string' && oldRecordChannelId.length > 0) return oldRecordChannelId
  return null
}

export function activeChannelIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/chats\/([^/?#]+)/)
  return match?.[1] ?? null
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const { data: currentUser } = useCurrentUser()
  const userId = currentUser?.id ?? null
  const activeChannelId = React.useMemo(() => activeChannelIdFromPathname(pathname), [pathname])
  const [visibleChannelCounts, setVisibleChannelCounts] = React.useState<Record<string, number>>({})
  const visibleChannelIds = React.useMemo(() => Object.keys(visibleChannelCounts), [visibleChannelCounts])
  const activeChannelIds = React.useMemo(() => {
    const ids = new Set<string>()
    if (activeChannelId) ids.add(activeChannelId)
    for (const id of visibleChannelIds) ids.add(id)
    return [...ids]
  }, [activeChannelId, visibleChannelIds])
  const activeChannelIdsKey = activeChannelIds.slice().sort().join(',')
  const activeChannelIdsRef = React.useRef<Set<string>>(new Set())
  activeChannelIdsRef.current = new Set(activeChannelIds)

  const [status, setStatus] = React.useState<RealtimeStatus>('connecting')
  const [degraded, setDegraded] = React.useState(false)

  const registerVisibleChannel = React.useCallback((channelId: string) => {
    setVisibleChannelCounts((current) => ({
      ...current,
      [channelId]: (current[channelId] ?? 0) + 1,
    }))
    return () => {
      setVisibleChannelCounts((current) => {
        const nextCount = (current[channelId] ?? 0) - 1
        if (nextCount > 0) return { ...current, [channelId]: nextCount }
        const { [channelId]: _removed, ...rest } = current
        return rest
      })
    }
  }, [])
  const visibleRealtimeChannelsValue = React.useMemo(
    () => ({ registerVisibleChannel }),
    [registerVisibleChannel],
  )

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
          const payload = (message as { payload?: unknown }).payload
          const table = tableOf(payload)
          if (table === 'notifications') {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] })
            // 新規DM・未参加チャンネルでの活動はチャンネル一覧の再取得で拾う
            scheduleListInvalidate()
          } else if (table === 'messages') {
            scheduleListInvalidate()
            const channelId = channelIdOf(payload)
            if (channelId && activeChannelIdsRef.current.has(channelId)) {
              void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
              void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
            }
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

  // ─── アクティブチャンネルトピック（messages / message_reactions）────
  // 本文・リアクションの即時反映は、現在表示中のチャンネルだけに絞る
  const activeTopicsRef = React.useRef<Map<string, RealtimeChannel>>(new Map())

  React.useEffect(() => {
    const supabase = createClient()
    const current = activeTopicsRef.current
    const wanted = new Set(activeChannelIds)

    for (const [id, channel] of [...current]) {
      if (!wanted.has(id)) {
        current.delete(id)
        void supabase.removeChannel(channel)
      }
    }

    // setAuth 完了前の join は認可で弾かれるため、ユーザートピック接続後にのみ join する
    if (!userId || status !== 'connected') return

    for (const channelId of activeChannelIds) {
      if (current.has(channelId)) continue
      const channel = supabase
        .channel(`channel:${channelId}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const table = tableOf((message as { payload?: unknown }).payload)
          if (table === 'messages') {
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
            void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
            scheduleListInvalidate()
          } else if (table === 'message_reactions') {
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
          }
        })

      channel.subscribe((subStatus, err) => {
        if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          console.error(`[Realtime] channel:${channelId} subscription failed:`, subStatus, err?.message ?? err)
        }
      })
      current.set(channelId, channel)
    }

    return () => {
      for (const channelId of activeChannelIds) {
        const channel = current.get(channelId)
        if (!channel) continue
        current.delete(channelId)
        void supabase.removeChannel(channel)
      }
    }
  }, [activeChannelIds, activeChannelIdsKey, userId, status, queryClient, scheduleListInvalidate])

  React.useEffect(() => () => {
    if (listTimerRef.current) clearTimeout(listTimerRef.current)
    const topics = activeTopicsRef.current
    const supabase = createClient()
    for (const channel of topics.values()) void supabase.removeChannel(channel)
    topics.clear()
  }, [])

  return (
    <VisibleRealtimeChannelsContext.Provider value={visibleRealtimeChannelsValue}>
      <RealtimeContext.Provider value={{ status, degraded }}>
        {children}
        <RealtimeIndicator />
      </RealtimeContext.Provider>
    </VisibleRealtimeChannelsContext.Provider>
  )
}
