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
}

type PresenceSessionMap = Record<string, PresenceSession>

function isPresenceStatus(status: UserStatus): status is 'online' | 'away' | 'offline' {
  return status === 'online' || status === 'away' || status === 'offline'
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
        sessions[key] = { lastActiveAt: (value as PresenceSession).lastActiveAt }
      }
    }
    return sessions
  } catch {
    return {}
  }
}

export function prunePresenceSessions(sessions: PresenceSessionMap, now: number): PresenceSessionMap {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, session]) => now - session.lastActiveAt <= STALE_MS),
  )
}

export function derivePresenceStatus(sessions: PresenceSessionMap, now: number): 'online' | 'away' | 'offline' {
  const activeSessions = Object.values(prunePresenceSessions(sessions, now))
  if (activeSessions.length === 0) return 'offline'
  return activeSessions.some(session => now - session.lastActiveAt <= IDLE_MS) ? 'online' : 'away'
}

export function PresenceTracker() {
  const queryClient = useQueryClient()
  const { data: me } = useCurrentUser()
  const sessionId = useMemo(() => crypto.randomUUID(), [])
  const flushRef = useRef<Promise<void> | null>(null)
  const lastSentStatusRef = useRef<UserStatus | null>(null)
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
      const next = prunePresenceSessions(readSessions(), now)
      delete next[sessionId]
      writeSessions(next)
      return next
    }

    function upsertSelf(now: number) {
      const next = prunePresenceSessions(readSessions(), now)
      next[sessionId] = { lastActiveAt: now }
      writeSessions(next)
      lastActivityAtRef.current = now
      return next
    }

    async function flushStatus(status: 'online' | 'away' | 'offline', keepalive = false) {
      if (!isPresenceStatus(currentStatus)) return
      if (status === currentStatus || status === lastSentStatusRef.current) return
      if (flushRef.current) return

      flushRef.current = (async () => {
        const res = await fetchWithAuth('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
          keepalive,
        })
        if (!res.ok) throw new Error(`presence update failed: ${res.status}`)
        queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status } : prev)
        lastSentStatusRef.current = status
      })()

      try {
        await flushRef.current
      } catch (error) {
        console.warn('[PresenceTracker] failed to update status', error)
      } finally {
        flushRef.current = null
      }
    }

    async function syncPresence(options?: { hidden?: boolean; now?: number; keepalive?: boolean }) {
      const now = options?.now ?? Date.now()
      const sessions = options?.hidden ? removeSelf(now) : upsertSelf(now)
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

    void syncPresence({ hidden: document.hidden, keepalive: document.hidden })

    const heartbeat = window.setInterval(() => {
      void syncPresence({ hidden: document.hidden })
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
