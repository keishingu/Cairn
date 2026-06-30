'use client'

import React from 'react'
import type { UserStatus } from '@/lib/user-status'

type AutoPresenceStatus = Extract<UserStatus, 'online' | 'offline'>
type TabActivityMap = Record<string, { active: boolean; updatedAt: number; workspaceId: string | null }>
type PresenceIntent = { status: UserStatus; source: 'auto' | 'manual'; workspaceId: string | null }
type PresenceIntentMap = Record<string, PresenceIntent>
type TabSessionRecord = { tabId: string; ownerId: string }

const TAB_ACTIVITY_STORAGE_KEY = 'cairn:auto-presence:tabs'
const TAB_ACTIVITY_TTL_MS = 30_000
const TAB_ACTIVITY_HEARTBEAT_MS = 10_000
const PRESENCE_INTENT_STORAGE_KEY = 'cairn:auto-presence:intent'
const TAB_ID_STORAGE_KEY = `${TAB_ACTIVITY_STORAGE_KEY}:id`
const GLOBAL_WORKSPACE_KEY = '__global__'

interface UpdateStatusOptions {
  keepalive?: boolean
}

interface UseAutoPresenceOptions {
  status: UserStatus | undefined
  workspaceId?: string | null
  updateStatus: (status: AutoPresenceStatus, options?: UpdateStatusOptions) => Promise<UserStatus | null>
  readCurrentStatus?: () => Promise<UserStatus | null>
}

function getPresenceIntentKey(workspaceId: string | null) {
  return workspaceId ?? GLOBAL_WORKSPACE_KEY
}

function readPresenceIntentMap(): PresenceIntentMap {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(PRESENCE_INTENT_STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<PresenceIntent>>
    const entries = Object.entries(parsed).flatMap(([key, value]) => {
      if (
        (value.status === 'online' || value.status === 'away' || value.status === 'busy' || value.status === 'offline')
        && (value.source === 'auto' || value.source === 'manual')
      ) {
        return [[key, {
          status: value.status,
          source: value.source,
          workspaceId: typeof value.workspaceId === 'string' ? value.workspaceId : null,
        } satisfies PresenceIntent] as const]
      }

      return []
    })
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function readPresenceIntent(workspaceId: string | null): PresenceIntent | null {
  const intents = readPresenceIntentMap()
  return intents[getPresenceIntentKey(workspaceId)] ?? null
}

function writePresenceIntent(intent: PresenceIntent) {
  setPresenceIntent(intent.workspaceId, intent)
}

function setPresenceIntent(workspaceId: string | null, intent: PresenceIntent | null) {
  if (typeof window === 'undefined') return
  const intents = readPresenceIntentMap()
  const key = getPresenceIntentKey(workspaceId)
  if (intent) {
    intents[key] = intent
  } else {
    delete intents[key]
  }
  window.localStorage.setItem(PRESENCE_INTENT_STORAGE_KEY, JSON.stringify(intents))
}

function parseTabSessionRecord(raw: string | null): TabSessionRecord | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<TabSessionRecord>
    if (typeof parsed.tabId === 'string' && typeof parsed.ownerId === 'string') {
      return { tabId: parsed.tabId, ownerId: parsed.ownerId }
    }
  } catch {
    return null
  }

  return null
}

export function recordManualPresenceStatus(status: UserStatus, workspaceId: string | null = null) {
  writePresenceIntent({ status, source: 'manual', workspaceId })
}

export function useAutoPresence({ status, workspaceId = null, updateStatus, readCurrentStatus }: UseAutoPresenceOptions) {
  const lastSentRef = React.useRef<AutoPresenceStatus | null>(null)
  const tabIdRef = React.useRef<string | null>(null)
  const tabOwnerIdRef = React.useRef<string>(
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  React.useEffect(() => {
    lastSentRef.current =
      status === 'online' || status === 'offline'
        ? status
        : null
  }, [status])

  const getTabId = React.useEffectEvent(() => {
    if (tabIdRef.current) return tabIdRef.current

    const existing = parseTabSessionRecord(window.sessionStorage.getItem(TAB_ID_STORAGE_KEY))
    if (existing?.ownerId === tabOwnerIdRef.current) {
      tabIdRef.current = existing.tabId
      return existing.tabId
    }

    const nextId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, JSON.stringify({
      tabId: nextId,
      ownerId: tabOwnerIdRef.current,
    } satisfies TabSessionRecord))
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
    nextRecords[tabId] = { active, updatedAt: Date.now(), workspaceId }
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
    return Object.entries(records).some(([candidateId, entry]) => {
      return candidateId !== tabId && entry.active && entry.workspaceId === workspaceId
    })
  })

  const syncStatus = React.useEffectEvent(async (nextStatus: AutoPresenceStatus, options?: UpdateStatusOptions) => {
    const currentIntent = readPresenceIntent(workspaceId)

    if (status === 'away' || status === 'busy') return
    if (currentIntent?.source === 'manual') {
      if (currentIntent.status === 'away' || currentIntent.status === 'busy') return
      if (currentIntent.status === 'offline' && nextStatus === 'online') return
      if (currentIntent.status === 'offline' && nextStatus === 'offline') return
    }
    if (lastSentRef.current === nextStatus) return

    if (readCurrentStatus && !options?.keepalive) {
      const currentStatus = await readCurrentStatus()
      if (currentStatus === 'away' || currentStatus === 'busy') return
      const isLocalAutoOffline =
        currentIntent?.source === 'auto'
        && currentIntent.status === 'offline'
        && nextStatus === 'online'
      if (currentStatus === 'offline' && nextStatus === 'online' && !isLocalAutoOffline) {
        lastSentRef.current = 'offline'
        return
      }
      if (currentStatus === nextStatus) {
        lastSentRef.current = nextStatus
        return
      }
    }

    lastSentRef.current = nextStatus
    const shouldPersistIntentBeforeAwait = nextStatus === 'offline' && options?.keepalive === true
    if (shouldPersistIntentBeforeAwait) {
      writePresenceIntent({ status: nextStatus, source: 'auto', workspaceId })
    }

    const resolvedStatus = await updateStatus(nextStatus, options)
    if (!resolvedStatus) {
      if (shouldPersistIntentBeforeAwait) {
        setPresenceIntent(workspaceId, currentIntent)
      }
      lastSentRef.current =
        status === 'online' || status === 'offline'
          ? status
          : null
      return
    }

    if (resolvedStatus === 'online' || resolvedStatus === 'offline') {
      lastSentRef.current = resolvedStatus
      writePresenceIntent({ status: resolvedStatus, source: 'auto', workspaceId })
      return
    }

    lastSentRef.current = null
    writePresenceIntent({ status: resolvedStatus, source: 'manual', workspaceId })
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
    const heartbeatId = window.setInterval(() => {
      const isVisible = document.visibilityState === 'visible'
      const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
      if (isVisible && hasFocus) {
        setCurrentTabActive(true)
      }
    }, TAB_ACTIVITY_HEARTBEAT_MS)

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
      window.clearInterval(heartbeatId)
      clearCurrentTab()
    }
  }, [status, clearCurrentTab, hasAnotherActiveTab, setCurrentTabActive, syncFromWindowState, syncStatus])
}
