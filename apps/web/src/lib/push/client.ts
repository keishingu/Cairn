// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf.buffer as ArrayBuffer
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetchWithAuth('/api/push/vapid-public-key')
    if (!res.ok) return null
    const data = await res.json() as { publicKey?: string }
    return data.publicKey ?? null
  } catch {
    return null
  }
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await fetchWithAuth('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
}

async function removeSubscription(sub: PushSubscription): Promise<void> {
  await fetchWithAuth('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('unsupported')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPermission(Notification.permission as PushPermissionState)
  }, [])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setLoading(true)
    try {
      const vapidKey = await getVapidPublicKey()
      if (!vapidKey) return

      const permission = await Notification.requestPermission()
      setPermission(permission as PushPermissionState)
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await saveSubscription(existing)
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      await saveSubscription(sub)
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removeSubscription(sub)
        await sub.unsubscribe()
      }
      setPermission('default')
    } finally {
      setLoading(false)
    }
  }, [])

  return { permission, loading, subscribe, unsubscribe }
}
