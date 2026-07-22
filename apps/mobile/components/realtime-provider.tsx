import React from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useMe } from '../hooks/use-account'
import { useProjectChannels } from '../hooks/use-projects'
import { useWorkspaceChannels, useWorkspaceDms } from '../hooks/use-chat-channels'
import { supabase } from '../lib/supabase'

function tableOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const table = (payload as { table?: unknown }).table
  return typeof table === 'string' ? table : undefined
}

function invalidateChannelLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['project-channels'] })
  void queryClient.invalidateQueries({ queryKey: ['workspace-channels'] })
  void queryClient.invalidateQueries({ queryKey: ['workspace-dms'] })
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const { data: projectChannels = [] } = useProjectChannels()
  const { data: workspaceChannels = [] } = useWorkspaceChannels()
  const { data: dms = [] } = useWorkspaceDms()
  const [authenticated, setAuthenticated] = React.useState(false)
  const [retryNonce, setRetryNonce] = React.useState(0)

  const channelIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const channel of projectChannels) ids.add(channel.channelId)
    for (const channel of workspaceChannels) ids.add(channel.id)
    for (const channel of dms) ids.add(channel.id)
    return [...ids].sort()
  }, [projectChannels, workspaceChannels, dms])

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
          const table = tableOf((message as { payload?: unknown }).payload)
          if (table === 'notifications' || table === 'channel_read_states') {
            invalidateChannelLists(queryClient)
            void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          }
        })
      userChannel.subscribe((status, error) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setAuthenticated(true)
          invalidateChannelLists(queryClient)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
  }, [me?.id, queryClient, retryNonce])

  React.useEffect(() => {
    if (!authenticated) return
    const subscriptions = channelIds.map((channelId) => {
      const channel = supabase
        .channel(`channel:${channelId}`, { config: { private: true } })
        .on('broadcast', { event: '*' }, (message) => {
          const table = tableOf((message as { payload?: unknown }).payload)
          if (table === 'messages' || table === 'message_reactions') {
            void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
          }
          if (table === 'messages') invalidateChannelLists(queryClient)
        })
      channel.subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            `[Realtime] channel:${channelId} の購読に失敗:`,
            status,
            error?.message ?? error,
          )
        }
      })
      return channel
    })

    return () => {
      for (const channel of subscriptions) void supabase.removeChannel(channel)
    }
  }, [authenticated, channelIds, queryClient])

  return <>{children}</>
}
