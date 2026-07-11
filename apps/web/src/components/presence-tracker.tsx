'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { UserStatus } from '@/lib/user-status'

const STORAGE_KEY = 'cairn-presence-sessions'
const HEARTBEAT_MS = 15_000
const IDLE_MS = 60_000
const STALE_MS = IDLE_MS + HEARTBEAT_MS
const ACTIVITY_THROTTLE_MS = 5_000

interface PresenceSession {
  lastActiveAt: number
  lastSeenAt: number
}

type PresenceSessionMap = Record<string, PresenceSession>

function isPresenceStatus(status: UserStatus): status is 'online' | 'away' | 'offline' {
  return status === 'online' || status === 'away' || status === 'offline'
}

export async function sendPresenceStatusUpdate(
  status: 'online' | 'away' | 'offline',
  options?: { keepalive?: boolean },
) {
  const res = await fetchWithAuth('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
    keepalive: options?.keepalive ?? false,
  })
  if (!res.ok) throw new Error(`presence update failed: ${res.status}`)
}

export function parsePresenceSessions(raw: string | null): PresenceSessionMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const sessions: PresenceSessionMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value
        && typeof value === 'object'
        && typeof (value as PresenceSession).lastActiveAt === 'number'
        && Number.isFinite((value as PresenceSession).lastActiveAt)
      ) {
        const lastActiveAt = (value as PresenceSession).lastActiveAt
        const lastSeenAt = typeof (value as PresenceSession).lastSeenAt === 'number'
          && Number.isFinite((value as PresenceSession).lastSeenAt)
          ? (value as PresenceSession).lastSeenAt
          : lastActiveAt
        sessions[key] = { lastActiveAt, lastSeenAt }
      }
    }
    return sessions
  } catch {
    return {}
  }
}

export function prunePresenceSessions(sessions: PresenceSessionMap, now: number): PresenceSessionMap {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => now - session.lastSeenAt <= STALE_MS),
  )
}

export function derivePresenceStatus(sessions: PresenceSessionMap, now: number): 'online' | 'away' | 'offline' {
  const activeSessions = Object.values(prunePresenceSessions(sessions, now))
  if (activeSessions.length === 0) return 'offline'
  return activeSessions.some(session => now - session.lastActiveAt <= IDLE_MS) ? 'online' : 'away'
}

export function updatePresenceSessions(
  sessions: PresenceSessionMap,
  sessionId: string,
  now: number,
  options?: { hidden?: boolean; preserveActivity?: boolean },
): PresenceSessionMap {
  const next = prunePresenceSessions(sessions, now)
  if (options?.hidden) {
    delete next[sessionId]
    return next
  }

  const previousLastActiveAt = next[sessionId]?.lastActiveAt
  const previousLastSeenAt = next[sessionId]?.lastSeenAt
  next[sessionId] = {
    lastActiveAt: options?.preserveActivity && previousLastActiveAt !== undefined ? previousLastActiveAt : now,
    lastSeenAt: options?.preserveActivity && previousLastSeenAt !== undefined ? now : now,
  }
  return next
}

export function PresenceTracker() {
  const queryClient = useQueryClient()
  const { data: me } = useCurrentUser()
  const sessionId = useMemo(() => crypto.randomUUID(), [])
  const flushRef = useRef<Promise<void> | null>(null)
  const keepaliveFlushRef = useRef<Promise<void> | null>(null)
  const lastSentStatusRef = useRef<UserStatus | null>(null)
  const pendingStatusRef = useRef<UserStatus | null>(null)
  const lastActivityAtRef = useRef(0)

  useEffect(() => {
    if (!me) return
    const currentStatus = me.status

    function readSessions() {
      return parsePresenceSessions(window.localStorage.getItem(STORAGE_KEY))
    }

    function writeSessions(sessions: PresenceSessionMap) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    }

    function removeSelf(now: number) {
      const next = updatePresenceSessions(readSessions(), sessionId, now, { hidden: true })
      writeSessions(next)
      return next
    }

    function upsertSelf(now: number) {
      const next = updatePresenceSessions(readSessions(), sessionId, now)
      writeSessions(next)
      lastActivityAtRef.current = now
      return next
    }

    function refreshSelf(now: number) {
      const next = updatePresenceSessions(readSessions(), sessionId, now, { preserveActivity: true })
      writeSessions(next)
      return next
    }

    async function applyStatus(status: 'online' | 'away' | 'offline', keepalive = false) {
      pendingStatusRef.current = status
      try {
        await sendPresenceStatusUpdate(status, { keepalive })
        queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status } : prev)
        lastSentStatusRef.current = status
      } finally {
        pendingStatusRef.current = null
      }
    }

    async function flushStatus(status: 'online' | 'away' | 'offline', keepalive = false) {
      if (!isPresenceStatus(currentStatus)) return
      if (status === lastSentStatusRef.current) return
      if (status === currentStatus && pendingStatusRef.current !== null && pendingStatusRef.current !== status) {
        // Allow an unload keepalive to supersede a different in-flight status update.
      } else if (status === currentStatus) {
        return
      }
      if (keepalive) {
        if (keepaliveFlushRef.current) return
        keepaliveFlushRef.current = (async () => {
          await applyStatus(status, true)
        })()

        try {
          await keepaliveFlushRef.current
        } catch (error) {
          console.warn('[PresenceTracker] failed to update status', error)
        } finally {
          keepaliveFlushRef.current = null
        }
        return
      }
      if (flushRef.current) return

      flushRef.current = (async () => {
        await applyStatus(status, false)
      })()

      try {
        await flushRef.current
      } catch (error) {
        console.warn('[PresenceTracker] failed to update status', error)
      } finally {
        flushRef.current = null
      }
    }

    async function syncPresence(options?: { hidden?: boolean; now?: number; keepalive?: boolean; preserveActivity?: boolean }) {
      const now = options?.now ?? Date.now()
      const sessions = options?.hidden
        ? removeSelf(now)
        : options?.preserveActivity
          ? refreshSelf(now)
          : upsertSelf(now)
      await flushStatus(derivePresenceStatus(sessions, now), options?.keepalive ?? false)
    }

    function onActivity() {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastActivityAtRef.current < ACTIVITY_THROTTLE_MS) return
      void syncPresence({ now })
    }

    function onVisibilityChange() {
      void syncPresence({ hidden: document.hidden, keepalive: document.hidden })
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      if (document.hidden) return
      void flushStatus(derivePresenceStatus(readSessions(), Date.now()))
    }

    void syncPresence({
      hidden: document.hidden,
      keepalive: document.hidden,
      preserveActivity: !document.hidden,
    })

    const heartbeat = window.setInterval(() => {
      void syncPresence({ hidden: document.hidden, preserveActivity: !document.hidden })
    }, HEARTBEAT_MS)

    window.addEventListener('pointermove', onActivity, { passive: true })
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    window.addEventListener('focus', onActivity)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onVisibilityChange)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('pointermove', onActivity)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onVisibilityChange)
      removeSelf(Date.now())
    }
  }, [me, queryClient, sessionId])

  return null
}
