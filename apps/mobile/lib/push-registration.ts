import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from './api-fetch'

// Expo Go の Android は SDK 53 以降プッシュ通知非対応のためスキップ
const isExpoGo = Constants.appOwnership === 'expo'
export const supportsNotifications = !(isExpoGo && Platform.OS === 'android')

// サーバーは channelId を指定せずに送るため、Android では "default" チャンネルに届く
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'default'

/**
 * Android 13 以降は通知チャンネルが1つも無いと、許可を求めてもダイアログが出ず許可できない。
 * 許可要求とトークン取得の前に必ず呼ぶ。同じ ID で作り直しても設定は保たれる（冪等）。iOS では何もしない
 */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Cairn',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

/**
 * 通知が届く default チャンネルを利用者がオフにしているか。アプリ全体の許可とは別に設定でき、
 * getPermissionsAsync() には現れない。チャンネルを作り直してもアプリから重要度は上げられないので、利用者の設定は上書きしない
 */
export async function isAndroidNotificationChannelDisabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  await ensureAndroidNotificationChannel()
  const channel = await Notifications.getNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID)
  return channel?.importance === Notifications.AndroidImportance.NONE
}

/** 許可済みの端末の Expo push token をサーバーに登録する。失敗は呼び出し側で扱う。 */
export async function registerPushToken(): Promise<void> {
  await ensureAndroidNotificationChannel()
  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.['eas']?.projectId
  if (!projectId) throw new Error('EAS projectId is not configured')

  const token = await Notifications.getExpoPushTokenAsync({ projectId })
  const response = await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ deviceType: 'expo', expoToken: token.data }),
  })
  if (!response.ok) throw new Error(`Push subscribe failed: ${response.status}`)
}
