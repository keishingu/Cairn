import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from './api-fetch'

// Expo Go の Android は SDK 53 以降プッシュ通知非対応のためスキップ
const isExpoGo = Constants.appOwnership === 'expo'
export const supportsNotifications = !(isExpoGo && Platform.OS === 'android')

/** 許可済みの端末の Expo push token をサーバーに登録する。失敗は呼び出し側で扱う。 */
export async function registerPushToken(): Promise<void> {
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
