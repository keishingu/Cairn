import React from 'react'
import { Platform } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
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

// Push の data.url（Web ルート）をネイティブのトップレベルタブへマップする。
// 個別チャンネルへのディープリンクは Phase 2 で対応予定。まずは該当セクションまで遷移させる
function routeFromNotificationResponse(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>,
) {
  const data = response.notification.request.content.data as { url?: string } | undefined
  const url = data?.url
  if (!url) return
  if (url.startsWith('/chat')) router.push('/(app)/chats')
  else if (url.startsWith('/tasks')) router.push('/(app)/tasks')
  else router.push('/(app)/notifications')
}

export default function AppLayout() {
  const router = useRouter()

  React.useEffect(() => {
    void registerPushToken()
  }, [])

  // 通知タップでの遷移。起動時（コールドスタート）とアプリ起動中の両方を処理する
  React.useEffect(() => {
    if (!supportsNotifications) return
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromNotificationResponse(response, router)
    })
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotificationResponse(response, router)
    })
    return () => sub.remove()
  }, [router])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 6,
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: 'プロジェクト',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'チャット',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'タスク',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '通知',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'AI',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'メニュー',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="files" options={{ href: null }} />
      <Tabs.Screen name="gallery" options={{ href: null }} />
      <Tabs.Screen name="members" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="signout" options={{ href: null }} />
    </Tabs>
  )
}
