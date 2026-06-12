import React from 'react'
import { Platform } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from '../../lib/api-fetch'
import { MobileNav } from '../../components/mobile-nav'
import { ProjectsViewProvider } from '../../components/projects-view-context'

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
    <ProjectsViewProvider>
      <Tabs
        // フッターはネイティブ実装の MobileNav に委譲する（圏外でもタブ切替を可能にし、
        // WebView 内の Web フッターと二重にならないようにするため）。
        // ディレクトリ配下に _layout がないため、ルート名は "projects/index" のように
        // ファイル単位になる点に注意（"projects" では一致しない）
        tabBar={(props) => <MobileNav {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="projects/index" />
        <Tabs.Screen name="chats/index" />
        <Tabs.Screen name="tasks/index" />
        <Tabs.Screen name="ai/index" />
        {/* 以下はタブに出さず、通知タップ・メニューからの遷移先としてのみ使う */}
        <Tabs.Screen name="projects/[id]" options={{ href: null }} />
        <Tabs.Screen name="chats/[channelId]" options={{ href: null }} />
        <Tabs.Screen name="notifications/index" options={{ href: null }} />
        <Tabs.Screen name="files" options={{ href: null }} />
        <Tabs.Screen name="gallery" options={{ href: null }} />
        <Tabs.Screen name="members" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </ProjectsViewProvider>
  )
}
