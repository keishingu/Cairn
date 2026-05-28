// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import webpush from 'web-push'

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY']
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY']
const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] ?? 'mailto:noreply@example.com'

let initialized = false

function ensureVapid() {
  if (initialized) return
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  initialized = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

interface Subscription {
  id: string
  endpoint: string
  keys: { p256dh: string; auth: string } | null
}

export async function sendWebPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

  ensureVapid()

  const { db, pushSubscriptions } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')

  const subs = await db
    .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, keys: pushSubscriptions.keys })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId)) as Subscription[]

  if (subs.length === 0) return

  const expiredIds: string[] = []

  await Promise.allSettled(
    subs
      .filter(s => s.keys?.p256dh && s.keys?.auth)
      .map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys! as { p256dh: string; auth: string } },
            JSON.stringify(payload),
          )
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            expiredIds.push(s.id)
          }
        }
      }),
  )

  if (expiredIds.length > 0) {
    const { inArray } = await import('drizzle-orm')
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds))
  }
}
