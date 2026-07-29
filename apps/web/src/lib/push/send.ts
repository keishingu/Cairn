// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import webpush from 'web-push'
import { Expo } from 'expo-server-sdk'

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY']
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY']
const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] ?? 'mailto:noreply@example.com'

let vapidInitialized = false
const expo = new Expo()

function ensureVapid() {
  if (vapidInitialized) return
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidInitialized = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/** Service Worker に送る、バッジ数を含めた実際の Web Push ペイロード */
interface PushMessage extends PushPayload {
  /**
   * OS のアプリアイコンに表示する未読数（Badging API 用）。
   * 集計に失敗した場合は省略し、Service Worker 側はバッジ更新をスキップする
   */
  badgeCount?: number
}

interface Subscription {
  id: string
  deviceType: string
  endpoint: string | null
  keys: { p256dh: string; auth: string } | null
  expoToken: string | null
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const { db, pushSubscriptions } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      deviceType: pushSubscriptions.deviceType,
      endpoint: pushSubscriptions.endpoint,
      keys: pushSubscriptions.keys,
      expoToken: pushSubscriptions.expoToken,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId)) as Subscription[]

  if (subs.length === 0) return

  // Web Push
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    ensureVapid()
    const webSubs = subs.filter(s => s.deviceType === 'web' && s.endpoint && s.keys?.p256dh && s.keys?.auth)
    const expiredIds: string[] = []

    // ホーム画面 PWA のアイコンに出す未読バッジ数（badgeCount は Web Push 専用）。
    // Push 送信時点で通知行は既に作成済みのため、この件数に新着分も含まれる。
    // best-effort: 集計に失敗しても通知本体（と後段の Expo push）は送る
    let badgeCount: number | undefined
    if (webSubs.length > 0) {
      try {
        const { getUnreadNotificationCount } = await import('@/lib/notifications/badge')
        badgeCount = await getUnreadNotificationCount(userId)
      } catch (err) {
        console.error('[sendPushToUser] badge count query failed', { message: (err as Error).message })
      }
    }
    const message: PushMessage = { ...payload, ...(badgeCount !== undefined ? { badgeCount } : {}) }

    await Promise.allSettled(
      webSubs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint!, keys: s.keys! as { p256dh: string; auth: string } },
            JSON.stringify(message),
          )
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            expiredIds.push(s.id)
          } else {
            console.error('[sendPushToUser] webpush error', { status, subscriptionId: s.id, message: (err as Error).message })
          }
        }
      }),
    )

    if (expiredIds.length > 0) {
      const { inArray } = await import('drizzle-orm')
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, expiredIds))
    }
  }

  // Expo Push
  // 注: ネイティブ（Expo）アプリのランチャーバッジ（setBadgeCountAsync）は
  // 既読時に減算・クリアする同期経路が apps/mobile 側に必要になるため、本 PR では
  // 付与しない（Web PWA バッジに範囲を限定）。Expo バッジ対応は別ブランチで行う。
  const expoSubs = subs.filter(s => s.deviceType === 'expo' && s.expoToken)
  if (expoSubs.length > 0) {
    const messages = expoSubs.map(s => {
      const msg: Parameters<typeof expo.chunkPushNotifications>[0][number] = {
        to: s.expoToken!,
        title: payload.title,
        body: payload.body,
      }
      if (payload.url) msg.data = { url: payload.url }
      return msg
    })
    const chunks = expo.chunkPushNotifications(messages)
    await Promise.allSettled(chunks.map(chunk => expo.sendPushNotificationsAsync(chunk)))
  }
}

/** @deprecated sendPushToUser を使用してください */
export const sendWebPushToUser = sendPushToUser
