import React from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { apiFetch } from '../../lib/api-fetch'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

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

function tabIcon(name: IoniconsName) {
  return ({ color }: { color: string }) => <Ionicons name={name} size={24} color={color} />
}

export default function AppLayout() {
  React.useEffect(() => {
    void registerPushToken()
  }, [])

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0070f3' }}>
      <Tabs.Screen
        name="projects"
        options={{ title: 'プロジェクト', tabBarIcon: tabIcon('folder-outline') }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: 'チャット', tabBarIcon: tabIcon('chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'タスク', tabBarIcon: tabIcon('checkmark-circle-outline') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: '通知', tabBarIcon: tabIcon('notifications-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'メニュー', tabBarIcon: tabIcon('menu-outline') }}
      />
    </Tabs>
  )
}
