import React from 'react'
import { Tabs } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { apiFetch } from '../../lib/api-fetch'

// フォアグラウンド通知の表示設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const projectId = process.env['EXPO_PUBLIC_EAS_PROJECT_ID']
  if (!projectId) return

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ deviceType: 'expo', expoToken: token.data }),
    })
  } catch {
    // トークン登録失敗は通知機能の欠如として扱い、ログのみ
    console.warn('[Push] Failed to register Expo push token')
  }
}

export default function AppLayout() {
  React.useEffect(() => {
    void registerPushToken()
  }, [])

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="menu" />
    </Tabs>
  )
}
