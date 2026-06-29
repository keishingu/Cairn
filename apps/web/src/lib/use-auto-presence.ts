'use client'

import React from 'react'
import type { UserStatus } from '@/lib/user-status'

type AutoPresenceStatus = Extract<UserStatus, 'online' | 'offline'>

interface UpdateStatusOptions {
  keepalive?: boolean
}

interface UseAutoPresenceOptions {
  status: UserStatus | undefined
  updateStatus: (status: AutoPresenceStatus, options?: UpdateStatusOptions) => Promise<boolean>
}

export function useAutoPresence({ status, updateStatus }: UseAutoPresenceOptions) {
  const lastSentRef = React.useRef<AutoPresenceStatus | null>(null)

  React.useEffect(() => {
    lastSentRef.current =
      status === 'online' || status === 'offline'
        ? status
        : null
  }, [status])

  const syncStatus = React.useEffectEvent(async (nextStatus: AutoPresenceStatus, options?: UpdateStatusOptions) => {
    if (status === 'away' || status === 'busy') return
    if (lastSentRef.current === nextStatus) return

    lastSentRef.current = nextStatus
    const ok = await updateStatus(nextStatus, options)
    if (!ok) {
      lastSentRef.current =
        status === 'online' || status === 'offline'
          ? status
          : null
    }
  })

  const syncFromWindowState = React.useEffectEvent(() => {
    const isVisible = document.visibilityState === 'visible'
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true

    void syncStatus(isVisible && hasFocus ? 'online' : 'offline')
  })

  React.useEffect(() => {
    if (status === undefined) return

    syncFromWindowState()

    const goOnline = () => {
      void syncStatus('online')
    }
    const goOffline = () => {
      void syncStatus('offline', { keepalive: true })
    }

    document.addEventListener('visibilitychange', syncFromWindowState)
    window.addEventListener('focus', goOnline)
    window.addEventListener('blur', syncFromWindowState)
    window.addEventListener('pageshow', goOnline)
    window.addEventListener('pagehide', goOffline)
    window.addEventListener('pointerdown', goOnline)
    window.addEventListener('keydown', goOnline)

    return () => {
      document.removeEventListener('visibilitychange', syncFromWindowState)
      window.removeEventListener('focus', goOnline)
      window.removeEventListener('blur', syncFromWindowState)
      window.removeEventListener('pageshow', goOnline)
      window.removeEventListener('pagehide', goOffline)
      window.removeEventListener('pointerdown', goOnline)
      window.removeEventListener('keydown', goOnline)
    }
  }, [status, syncFromWindowState, syncStatus])
}
