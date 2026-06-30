'use client'

import React from 'react'
import { WORKSPACE_HEADER } from '@/lib/workspace-cookie'
import { USER_STATUSES, type UserStatus } from '@/lib/user-status'

type AutoPresenceStatus = Extract<UserStatus, 'online' | 'offline'>
type TabActivityMap = Record<string, { active: boolean; updatedAt: number; workspaceId: string | null }>
type PresenceIntent = { status: UserStatus; source: 'auto' | 'manual'; workspaceId: string | null; origin?: 'explicit' | 'remote' }
type PresenceIntentMap = Record<string, PresenceIntent>
type TabSessionRecord = { tabId: string; ownerId: string }
type TabActivityRecord = { active: boolean; updatedAt: number; workspaceId: string | null }
type PresenceSnapshot = { status: UserStatus; auto: boolean }
type SyncAttempt = { token: number; status: AutoPresenceStatus; keepalive: boolean; pending: boolean }

const TAB_ACTIVITY_STORAGE_KEY = 'cairn:auto-presence:tabs'
const TAB_ACTIVITY_RECORD_STORAGE_PREFIX = `${TAB_ACTIVITY_STORAGE_KEY}:record:`
const TAB_ACTIVITY_TTL_MS = 30_000
const TAB_ACTIVITY_HEARTBEAT_MS = 10_000
const INTERACTION_ONLINE_REVALIDATE_MS = 15_000
const PRESENCE_INTENT_STORAGE_KEY = 'cairn:auto-presence:intent'
const TAB_ID_STORAGE_KEY = `${TAB_ACTIVITY_STORAGE_KEY}:id`
const GLOBAL_WORKSPACE_KEY = '__global__'

interface UpdateStatusOptions {
  keepalive?: boolean
}

interface SyncStatusOptions extends UpdateStatusOptions {
  trigger?: 'interaction'
}

interface UseAutoPresenceOptions {
  status: UserStatus | undefined
  workspaceId?: string | null
  updateStatus: (status: AutoPresenceStatus, options?: UpdateStatusOptions) => Promise<UserStatus | null>
  readCurrentPresence?: () => Promise<PresenceSnapshot | null>
  observePresence?: (snapshot: PresenceSnapshot) => void
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
          ...(value.source === 'manual'
            ? { origin: value.origin === 'remote' ? 'remote' : 'explicit' as const }
            : {}),
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

function getTabActivityStorageKey(tabId: string) {
  return `${TAB_ACTIVITY_RECORD_STORAGE_PREFIX}${tabId}`
}

function parseTabActivityRecord(raw: string | null): TabActivityRecord | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<TabActivityRecord>
    if (
      typeof parsed.active === 'boolean'
      && typeof parsed.updatedAt === 'number'
      && (typeof parsed.workspaceId === 'string' || parsed.workspaceId === null || parsed.workspaceId === undefined)
    ) {
      return {
        active: parsed.active,
        updatedAt: parsed.updatedAt,
        workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null,
      }
    }
  } catch {
    return null
  }

  return null
}

export function recordManualPresenceStatus(status: UserStatus, workspaceId: string | null = null) {
  writePresenceIntent({ status, source: 'manual', workspaceId, origin: 'explicit' })
}

export async function syncPresenceOfflineOnLogout(workspaceId: string | null = null) {
  if (typeof window === 'undefined') return null

  try {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (workspaceId) {
      headers.set(WORKSPACE_HEADER, workspaceId)
    }

    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers,
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ status: 'offline', auto: true, force: true }),
    })
    if (!res.ok) return null

    const dto = await res.json().catch(() => null) as { status?: unknown; statusAuto?: unknown } | null
    if (typeof dto?.status !== 'string' || !USER_STATUSES.includes(dto.status as UserStatus)) return null

    const nextStatus = dto.status as UserStatus
    if (nextStatus === 'online' || nextStatus === 'offline') {
      writePresenceIntent({
        status: nextStatus,
        source: dto.statusAuto === true ? 'auto' : 'manual',
        workspaceId,
        ...(dto.statusAuto === true ? {} : { origin: 'remote' as const }),
      })
      return nextStatus
    }

    writePresenceIntent({ status: nextStatus, source: 'manual', workspaceId, origin: 'remote' })
    return nextStatus
  } catch {
    return null
  }
}

export function useAutoPresence({
  status,
  workspaceId = null,
  updateStatus,
  readCurrentPresence,
  observePresence,
}: UseAutoPresenceOptions) {
  const lastSentRef = React.useRef<AutoPresenceStatus | null>(null)
  const lastSyncAttemptRef = React.useRef<SyncAttempt | null>(null)
  const pendingOfflineCheckRef = React.useRef<number | null>(null)
  const transitionTokenRef = React.useRef(0)
  const latestRequestedStatusRef = React.useRef<AutoPresenceStatus | null>(null)
  const lastInteractionOnlineSyncAtRef = React.useRef(0)
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
    const records: TabActivityMap = {}
    const storageKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))

    for (const storageKey of storageKeys) {
      if (!storageKey?.startsWith(TAB_ACTIVITY_RECORD_STORAGE_PREFIX)) continue

      const tabId = storageKey.slice(TAB_ACTIVITY_RECORD_STORAGE_PREFIX.length)
      if (!tabId) continue

      const record = parseTabActivityRecord(window.localStorage.getItem(storageKey))
      if (!record || now - record.updatedAt >= TAB_ACTIVITY_TTL_MS) {
        window.localStorage.removeItem(storageKey)
        continue
      }

      records[tabId] = record
    }

    return records
  })

  const setCurrentTabActive = React.useEffectEvent((active: boolean) => {
    const tabId = getTabId()
    const nextRecords = readTabActivity()
    const record = { active, updatedAt: Date.now(), workspaceId }
    nextRecords[tabId] = record
    window.localStorage.setItem(getTabActivityStorageKey(tabId), JSON.stringify(record))
    return nextRecords
  })

  const clearCurrentTab = React.useEffectEvent(() => {
    const tabId = getTabId()
    const nextRecords = readTabActivity()
    delete nextRecords[tabId]
    window.localStorage.removeItem(getTabActivityStorageKey(tabId))
    return nextRecords
  })

  const hasAnotherActiveTab = React.useEffectEvent((records: TabActivityMap) => {
    const tabId = getTabId()
    return Object.entries(records).some(([candidateId, entry]) => {
      if (candidateId === tabId || !entry.active) return false
      if (entry.workspaceId === workspaceId) return true
      return workspaceId != null && entry.workspaceId == null
    })
  })

  const canAutoSyncOffline = React.useEffectEvent(() => {
    return workspaceId != null
  })

  const isWindowActive = React.useEffectEvent(() => {
    const isVisible = document.visibilityState === 'visible'
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
    return isVisible && hasFocus
  })

  const applyPresenceSnapshot = React.useEffectEvent((snapshot: PresenceSnapshot) => {
    if (snapshot.status === 'online' || snapshot.status === 'offline') {
      lastSentRef.current = snapshot.status
      writePresenceIntent(snapshot.auto
        ? { status: snapshot.status, source: 'auto', workspaceId }
        : { status: snapshot.status, source: 'manual', workspaceId, origin: 'remote' })
      return
    }

    lastSentRef.current = null
    writePresenceIntent({ status: snapshot.status, source: 'manual', workspaceId, origin: 'remote' })
  })

  const applyResolvedStatus = React.useEffectEvent((resolvedStatus: UserStatus) => {
    applyPresenceSnapshot({ status: resolvedStatus, auto: resolvedStatus === 'online' || resolvedStatus === 'offline' })
  })

  const clearPendingOfflineCheck = React.useEffectEvent(() => {
    if (pendingOfflineCheckRef.current == null) return
    window.clearTimeout(pendingOfflineCheckRef.current)
    pendingOfflineCheckRef.current = null
  })

  const restoreOnlineIfWindowActive = React.useEffectEvent(async () => {
    if (!isWindowActive()) return

    const currentIntent = readPresenceIntent(workspaceId)
    if (currentIntent?.source === 'manual') return

    lastSentRef.current = 'online'
    const resolvedStatus = await updateStatus('online')
    if (!resolvedStatus) {
      lastSentRef.current =
        status === 'online' || status === 'offline'
          ? status
          : null
      return
    }

    applyResolvedStatus(resolvedStatus)
  })

  const syncStatus = React.useEffectEvent(async (nextStatus: AutoPresenceStatus, options?: SyncStatusOptions) => {
    const transitionToken = ++transitionTokenRef.current
    latestRequestedStatusRef.current = nextStatus
    let currentIntent = readPresenceIntent(workspaceId)
    const shouldAllowKeepaliveOfflineDespiteManualState =
      nextStatus === 'offline'
      && options?.keepalive === true
      && currentIntent?.source === 'manual'
    let knownCurrentPresence: PresenceSnapshot | null | undefined
    let didPreflightRead = false

    if ((status === 'away' || status === 'busy' || currentIntent?.source === 'manual') && readCurrentPresence && !options?.keepalive) {
      knownCurrentPresence = await readCurrentPresence()
      if (knownCurrentPresence) {
        observePresence?.(knownCurrentPresence)
      }
      if (knownCurrentPresence?.status === 'online') {
        setPresenceIntent(workspaceId, null)
        currentIntent = null
      } else if (
        knownCurrentPresence
        && (knownCurrentPresence.status === 'away' || knownCurrentPresence.status === 'busy' || knownCurrentPresence.status === 'offline')
      ) {
        currentIntent = knownCurrentPresence.auto
          ? { status: knownCurrentPresence.status, source: 'auto', workspaceId }
          : { status: knownCurrentPresence.status, source: 'manual', workspaceId, origin: 'remote' }
        writePresenceIntent(currentIntent)
      }
    }
    if (status === 'away' || status === 'busy') {
      if (
        knownCurrentPresence
        && knownCurrentPresence.status !== 'away'
        && knownCurrentPresence.status !== 'busy'
      ) {
        // Another tab/device already cleared the manual state, so continue with the refreshed presence.
      } else if (!shouldAllowKeepaliveOfflineDespiteManualState) {
        return
      }
    }
    if (currentIntent?.source === 'manual') {
      if (
        !shouldAllowKeepaliveOfflineDespiteManualState
        && (currentIntent.status === 'away' || currentIntent.status === 'busy')
      ) return
      if (currentIntent.status === 'offline' && nextStatus === 'online') return
      if (
        currentIntent.status === 'offline'
        && nextStatus === 'offline'
        && !shouldAllowKeepaliveOfflineDespiteManualState
      ) return
    }
    if (nextStatus === 'online' && options?.trigger === 'interaction') {
      const now = Date.now()
      const alreadyOnline = status === 'online' || lastSentRef.current === 'online'
      if (alreadyOnline && now - lastInteractionOnlineSyncAtRef.current < INTERACTION_ONLINE_REVALIDATE_MS) {
        return
      }
      lastInteractionOnlineSyncAtRef.current = now
    }
    if (lastSentRef.current === nextStatus) {
      if (nextStatus === 'offline' && options?.keepalive) {
        const lastAttempt = lastSyncAttemptRef.current
        const alreadyCompletedKeepaliveOffline =
          lastAttempt?.status === 'offline'
          && lastAttempt.keepalive
          && !lastAttempt.pending
        if (alreadyCompletedKeepaliveOffline) return
      } else if (nextStatus === 'offline' || !readCurrentPresence || options?.keepalive) {
        return
      }
    }

    if (readCurrentPresence && !options?.keepalive) {
      didPreflightRead = true
      const hadKnownCurrentPresence = knownCurrentPresence != null
      const currentPresence = knownCurrentPresence ?? await readCurrentPresence()
      knownCurrentPresence = currentPresence
      if (!hadKnownCurrentPresence && currentPresence) {
        observePresence?.(currentPresence)
      }
      const currentStatus = currentPresence?.status ?? null
      if (currentStatus === 'away' || currentStatus === 'busy') return
      const canRestoreAutoOffline =
        currentStatus === 'offline'
        && nextStatus === 'online'
        && currentPresence?.auto === true
      if (currentStatus === 'offline' && nextStatus === 'online' && !canRestoreAutoOffline) {
        lastSentRef.current = 'offline'
        return
      }
      if (currentStatus === nextStatus) {
        applyResolvedStatus(currentStatus)
        return
      }
    }

    if (lastSentRef.current === nextStatus && (!didPreflightRead || knownCurrentPresence == null)) {
      if (nextStatus === 'offline' && options?.keepalive) {
        const lastAttempt = lastSyncAttemptRef.current
        const alreadyCompletedKeepaliveOffline =
          lastAttempt?.status === 'offline'
          && lastAttempt.keepalive
          && !lastAttempt.pending
        if (alreadyCompletedKeepaliveOffline) return
      } else {
        return
      }
    }

    if (nextStatus === 'offline' && !options?.keepalive) {
      const supersededByDifferentStatus =
        transitionToken !== transitionTokenRef.current
        && latestRequestedStatusRef.current !== nextStatus
      if (supersededByDifferentStatus || isWindowActive()) return
    }

    lastSentRef.current = nextStatus
    lastSyncAttemptRef.current = {
      token: transitionToken,
      status: nextStatus,
      keepalive: options?.keepalive === true,
      pending: true,
    }
    const shouldPersistIntentBeforeAwait = nextStatus === 'offline' && options?.keepalive === true
    if (shouldPersistIntentBeforeAwait) {
      writePresenceIntent({ status: nextStatus, source: 'auto', workspaceId })
    }

    const resolvedStatus = await updateStatus(nextStatus, options)
    if (!resolvedStatus) {
      if (lastSyncAttemptRef.current?.token === transitionToken) {
        lastSyncAttemptRef.current = null
      }
      if (shouldPersistIntentBeforeAwait) {
        setPresenceIntent(workspaceId, currentIntent)
      }
      lastSentRef.current =
        status === 'online' || status === 'offline'
          ? status
          : null
      return
    }

    if (lastSyncAttemptRef.current?.token === transitionToken) {
      lastSyncAttemptRef.current = {
        token: transitionToken,
        status: nextStatus,
        keepalive: options?.keepalive === true,
        pending: false,
      }
    }

    const supersededByDifferentStatus =
      transitionToken !== transitionTokenRef.current
      && latestRequestedStatusRef.current !== nextStatus
    if (nextStatus === 'offline' && supersededByDifferentStatus) {
      if (isWindowActive()) {
        if (options?.keepalive && readCurrentPresence) {
          const currentPresence = await readCurrentPresence()
          observePresence?.(currentPresence)
          applyPresenceSnapshot(currentPresence)
          if (currentPresence.status === 'offline' && currentPresence.auto !== true) {
            return
          }
        }
        await restoreOnlineIfWindowActive()
      }
      return
    }

    applyResolvedStatus(resolvedStatus)
  })

  const syncFromWindowState = React.useEffectEvent(() => {
    const isVisible = document.visibilityState === 'visible'
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
    const nextRecords = setCurrentTabActive(isVisible && hasFocus)

    if (isVisible && hasFocus) {
      clearPendingOfflineCheck()
      void syncStatus('online')
      return
    }

    if (canAutoSyncOffline() && !hasAnotherActiveTab(nextRecords)) {
      clearPendingOfflineCheck()
      pendingOfflineCheckRef.current = window.setTimeout(() => {
        pendingOfflineCheckRef.current = null
        if (isWindowActive()) return

        const latestRecords = readTabActivity()
        if (!hasAnotherActiveTab(latestRecords)) {
          void syncStatus('offline')
        }
      }, 0)
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
      clearPendingOfflineCheck()
      setCurrentTabActive(true)
      void syncStatus('online')
    }
    const revalidateOnlineFromInteraction = () => {
      setCurrentTabActive(true)
      void syncStatus('online', { trigger: 'interaction' })
    }
    const goOffline = () => {
      clearPendingOfflineCheck()
      const nextRecords = clearCurrentTab()
      if (canAutoSyncOffline() && !hasAnotherActiveTab(nextRecords)) {
        void syncStatus('offline', { keepalive: true })
      }
    }

    document.addEventListener('visibilitychange', syncFromWindowState)
    window.addEventListener('focus', goOnline)
    window.addEventListener('blur', syncFromWindowState)
    window.addEventListener('pageshow', goOnline)
    window.addEventListener('pagehide', goOffline)
    window.addEventListener('pointerdown', revalidateOnlineFromInteraction)
    window.addEventListener('keydown', revalidateOnlineFromInteraction)

    return () => {
      document.removeEventListener('visibilitychange', syncFromWindowState)
      window.removeEventListener('focus', goOnline)
      window.removeEventListener('blur', syncFromWindowState)
      window.removeEventListener('pageshow', goOnline)
      window.removeEventListener('pagehide', goOffline)
      window.removeEventListener('pointerdown', revalidateOnlineFromInteraction)
      window.removeEventListener('keydown', revalidateOnlineFromInteraction)
      window.clearInterval(heartbeatId)
      clearPendingOfflineCheck()
      clearCurrentTab()
    }
  }, [status, workspaceId, clearCurrentTab, clearPendingOfflineCheck, hasAnotherActiveTab, setCurrentTabActive, syncFromWindowState, syncStatus])
}
