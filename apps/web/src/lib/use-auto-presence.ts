'use client'

import React from 'react'
import type { UserStatus } from '@/lib/user-status'

type AutoPresenceStatus = Extract<UserStatus, 'online' | 'offline'>
type TabActivityMap = Record<string, { active: boolean; updatedAt: number }>
type PresenceIntent = { status: UserStatus; source: 'auto' | 'manual' }

const TAB_ACTIVITY_STORAGE_KEY = 'cairn:auto-presence:tabs'
const TAB_ACTIVITY_TTL_MS = 30_000
const PRESENCE_INTENT_STORAGE_KEY = 'cairn:auto-presence:intent'

interface UpdateStatusOptions {
  keepalive?: boolean
}

interface UseAutoPresenceOptions {
  status: UserStatus | undefined
  updateStatus: (status: AutoPresenceStatus, options?: UpdateStatusOptions) => Promise<boolean>
}

function readPresenceIntent(): PresenceIntent | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PresenceIntent>
    if (
      (parsed.status === 'online' || parsed.status === 'away' || parsed.status === 'busy' || parsed.status === 'offline')
      && (parsed.source === 'auto' || parsed.source === 'manual')
    ) {
      return { status: parsed.status, source: parsed.source }
    }
  } catch {
    return null
  }

  return null
}

function writePresenceIntent(intent: PresenceIntent) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRESENCE_INTENT_STORAGE_KEY, JSON.stringify(intent))
}

export function recordManualPresenceStatus(status: UserStatus) {
  writePresenceIntent({ status, source: 'manual' })
}

export function useAutoPresence({ status, updateStatus }: UseAutoPresenceOptions) {
  const lastSentRef = React.useRef<AutoPresenceStatus | null>(null)
  const tabIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    lastSentRef.current =
      status === 'online' || status === 'offline'
        ? status
        : null
  }, [status])

  const getTabId = React.useEffectEvent(() => {
    if (tabIdRef.current) return tabIdRef.current

    const storageKey = `${TAB_ACTIVITY_STORAGE_KEY}:id`
    const existing = window.sessionStorage.getItem(storageKey)
    if (existing) {
      tabIdRef.current = existing
      return existing
    }

    const nextId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.sessionStorage.setItem(storageKey, nextId)
    tabIdRef.current = nextId
    return nextId
  })

  const readTabActivity = React.useEffectEvent(() => {
    const now = Date.now()
    const raw = window.localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as TabActivityMap : {}
    const nextEntries = Object.entries(parsed).filter(([, entry]) => {
      return entry && typeof entry.updatedAt === 'number' && now - entry.updatedAt < TAB_ACTIVITY_TTL_MS
    })
    return Object.fromEntries(nextEntries) as TabActivityMap
  })

  const writeTabActivity = React.useEffectEvent((records: TabActivityMap) => {
    window.localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, JSON.stringify(records))
  })

  const setCurrentTabActive = React.useEffectEvent((active: boolean) => {
    const tabId = getTabId()
    const nextRecords = readTabActivity()
    nextRecords[tabId] = { active, updatedAt: Date.now() }
    writeTabActivity(nextRecords)
    return nextRecords
  })

  const clearCurrentTab = React.useEffectEvent(() => {
    const tabId = getTabId()
    const nextRecords = readTabActivity()
    delete nextRecords[tabId]
    writeTabActivity(nextRecords)
    return nextRecords
  })

  const hasAnotherActiveTab = React.useEffectEvent((records: TabActivityMap) => {
    const tabId = getTabId()
    return Object.entries(records).some(([candidateId, entry]) => candidateId !== tabId && entry.active)
  })

  const syncStatus = React.useEffectEvent(async (nextStatus: AutoPresenceStatus, options?: UpdateStatusOptions) => {
    const lastIntent = readPresenceIntent()

    if (status === 'away' || status === 'busy') return
    if (lastIntent?.source === 'manual') {
      if (lastIntent.status === 'away' || lastIntent.status === 'busy') return
      if (lastIntent.status === 'offline' && nextStatus === 'online') return
    }
    if (lastSentRef.current === nextStatus) return

    lastSentRef.current = nextStatus
    const ok = await updateStatus(nextStatus, options)
    if (!ok) {
      lastSentRef.current =
        status === 'online' || status === 'offline'
          ? status
          : null
      return
    }
    writePresenceIntent({ status: nextStatus, source: 'auto' })
  })

  const syncFromWindowState = React.useEffectEvent(() => {
    const isVisible = document.visibilityState === 'visible'
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
    const nextRecords = setCurrentTabActive(isVisible && hasFocus)

    if (isVisible && hasFocus) {
      void syncStatus('online')
      return
    }

    if (!hasAnotherActiveTab(nextRecords)) {
      void syncStatus('offline')
    }
  })

  React.useEffect(() => {
    if (status === undefined) return

    syncFromWindowState()

    const goOnline = () => {
      setCurrentTabActive(true)
      void syncStatus('online')
    }
    const goOffline = () => {
      const nextRecords = clearCurrentTab()
      if (!hasAnotherActiveTab(nextRecords)) {
        void syncStatus('offline', { keepalive: true })
      }
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
      clearCurrentTab()
    }
  }, [status, clearCurrentTab, hasAnotherActiveTab, setCurrentTabActive, syncFromWindowState, syncStatus])
}
