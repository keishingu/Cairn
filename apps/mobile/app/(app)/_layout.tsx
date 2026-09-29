import React from 'react'
import { Platform } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { apiFetch } from '../../lib/api-fetch'
import { MobileNav } from '../../components/mobile-nav'
import { ProjectsViewProvider } from '../../components/projects-view-context'
import { AppearanceProvider } from '../../components/appearance-provider'
import { RealtimeProvider } from '../../components/realtime-provider'
import { OfflineMessageQueueProvider } from '../../components/offline-message-queue-provider'
import { NotificationPanelProvider } from '../../components/notification-panel-provider'
import { useT } from '../../components/locale-provider'
import { followNotification } from '../../lib/follow-notification'
import { readPushNotificationData, routeFromPushUrl } from '../../lib/notification-routing'

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

  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.['eas']?.projectId
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

function routeFromNotificationResponse(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>,
  t: ReturnType<typeof useT>,
) {
  const { url, workspaceId } = readPushNotificationData(response.notification.request.content.data)
  const destination = routeFromPushUrl(url)
  if (!destination) return
  void followNotification(router, destination, {
    ...(workspaceId ? { workspaceId } : {}),
    t,
  })
}

export default function AppLayout() {
  const router = useRouter()
  const t = useT()
  // 言語が決まってからリスナーを張り直すと、起動時の通知で二重に遷移する。
  const tRef = React.useRef(t)
  tRef.current = t

  React.useEffect(() => {
    void registerPushToken()
  }, [])

  // 通知タップでの遷移。起動時（コールドスタート）とアプリ起動中の両方を処理する
  React.useEffect(() => {
    if (!supportsNotifications) return
    const route = (response: Notifications.NotificationResponse) => {
      routeFromNotificationResponse(response, router, tRef.current)
    }
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) route(response)
    })
    const sub = Notifications.addNotificationResponseReceivedListener(route)
    return () => sub.remove()
  }, [router])

  return (
    <RealtimeProvider>
      <OfflineMessageQueueProvider>
        <AppearanceProvider>
          <NotificationPanelProvider>
            <ProjectsViewProvider>
              <Tabs
                screenOptions={{ headerShown: false }}
                tabBar={(props) => <MobileNav {...props} />}
              >
                <Tabs.Screen name="chats/index" />
                <Tabs.Screen name="projects/index" />
                <Tabs.Screen name="chats/[channelId]" options={{ href: null }} />
                <Tabs.Screen name="chat-tools/index" options={{ href: null }} />
                <Tabs.Screen name="tasks/index" />
                <Tabs.Screen name="ai/index" />
                <Tabs.Screen name="projects/[id]" options={{ href: null }} />
                <Tabs.Screen name="notifications/index" options={{ href: null }} />
                <Tabs.Screen name="files/index" options={{ href: null }} />
                <Tabs.Screen name="gallery/index" options={{ href: null }} />
                <Tabs.Screen name="members/index" options={{ href: null }} />
                <Tabs.Screen name="settings/index" options={{ href: null }} />
                <Tabs.Screen name="signout/index" options={{ href: null }} />
                <Tabs.Screen name="menu/index" options={{ href: null }} />
              </Tabs>
            </ProjectsViewProvider>
          </NotificationPanelProvider>
        </AppearanceProvider>
      </OfflineMessageQueueProvider>
    </RealtimeProvider>
  )
}
