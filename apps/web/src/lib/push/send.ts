// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import webpush from 'web-push'
import { Expo } from 'expo-server-sdk'
import { expoPushData } from './expo-push-data'
import { isAllowedWebPushEndpoint } from './endpoint'

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
  /** Expo が通知タップ時に切り替えるワークスペース。未所属の ID はクライアントが捨てる。 */
  workspaceId?: string
}

export interface PushDeliveryOptions {
  /** false の場合、通知は送るが Web・Expo のアプリアイコンバッジは更新しない。 */
  updateAppBadge?: boolean
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

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  { updateAppBadge = true }: PushDeliveryOptions = {},
): Promise<void> {
  const { db, pushSubscriptions } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')

  const subs = (await db
    .select({
      id: pushSubscriptions.id,
      deviceType: pushSubscriptions.deviceType,
      endpoint: pushSubscriptions.endpoint,
      keys: pushSubscriptions.keys,
      expoToken: pushSubscriptions.expoToken,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))) as Subscription[]

  if (subs.length === 0) return

  const webSubs =
    VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
      ? subs.filter((s) => s.deviceType === 'web' && s.endpoint && isAllowedWebPushEndpoint(s.endpoint) && s.keys?.p256dh && s.keys?.auth)
      : []
  const expoSubs = subs.filter((s) => s.deviceType === 'expo' && s.expoToken)

  // PWA と Expo アプリのアイコンに出す未読バッジ数。VAPID が未設定でも Expo には届ける。
  // Push 送信時点で通知行は既に作成済みのため、この件数に新着分も含まれる。
  // best-effort: 集計に失敗しても通知本体は送る
  let badgeCount: number | undefined
  if ((webSubs.length > 0 || expoSubs.length > 0) && updateAppBadge) {
    try {
      const { getUnreadNotificationCount } = await import('@/lib/notifications/badge')
      badgeCount = await getUnreadNotificationCount(userId)
    } catch (err) {
      console.error('[sendPushToUser] badge count query failed', {
        message: (err as Error).message,
      })
    }
  }

  // Web Push
  if (webSubs.length > 0) {
    ensureVapid()
    const expiredIds: string[] = []
    const message: PushMessage = {
      title: payload.title,
      body: payload.body,
      ...(payload.url ? { url: payload.url } : {}),
      ...(badgeCount !== undefined ? { badgeCount } : {}),
    }

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
            console.error('[sendPushToUser] webpush error', {
              status,
              subscriptionId: s.id,
              message: (err as Error).message,
            })
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
  // badge は iOS のアイコンの数字をアプリ非起動のまま更新する（省略すると OS の数字は変わらない）。
  // 既読時の減算・クリアは apps/mobile の useAppBadgeSync が badge-count API の値で行う
  if (expoSubs.length > 0) {
    const messages = expoSubs.map((s) => {
      const msg: Parameters<typeof expo.chunkPushNotifications>[0][number] = {
        to: s.expoToken!,
        title: payload.title,
        body: payload.body,
      }
      const data = expoPushData(payload)
      if (data) msg.data = data
      if (badgeCount !== undefined) msg.badge = badgeCount
      return msg
    })
    const chunks = expo.chunkPushNotifications(messages)
    await Promise.allSettled(chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk)))
  }
}

/** @deprecated sendPushToUser を使用してください */
export const sendWebPushToUser = sendPushToUser
