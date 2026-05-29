import React from 'react'
import { Platform } from 'react-native'
import { Tabs } from 'expo-router'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from '../../lib/api-fetch'

// Expo Go の Android は SDK 53 以降プッシュ通知非対応のためスキップ
const isExpoGo = Constants.appOwnership === 'expo'
const supportsNotifications = !(isExpoGo && Platform.OS === 'android')

if (supportsNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

async function registerPushToken() {
  if (!supportsNotifications) return

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
