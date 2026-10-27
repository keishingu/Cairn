import React from 'react'
import { Alert } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MobileNav } from '../../components/mobile-nav'
import { ProjectsViewProvider } from '../../components/projects-view-context'
import { AppearanceProvider } from '../../components/appearance-provider'
import { RealtimeProvider } from '../../components/realtime-provider'
import { OfflineMessageQueueProvider } from '../../components/offline-message-queue-provider'
import { NotificationPanelProvider } from '../../components/notification-panel-provider'
import { AppModalHost } from '../../components/app-modal-host'
import { useT } from '../../components/locale-provider'
import { followNotification } from '../../lib/follow-notification'
import { readPushNotificationData, routeFromPushUrl } from '../../lib/notification-routing'
import { completePendingRemoval, loadPushEnabled, loadPushSetting } from '../../lib/push-preference'
import { useSession } from '../../lib/session-context'
import {
  ensureAndroidNotificationChannel,
  registerPushToken,
  supportsNotifications,
  unregisterPushToken,
} from '../../lib/push-registration'

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

// 起動時に許可を求めて登録する（ダイアログが出るのは初回だけ）。通知一覧のスイッチでオフにしたユーザーは登録し直さない。
// 拒否後の再許可も通知一覧のスイッチから行う
async function requestAndRegisterPush(userId: string) {
  if (!supportsNotifications) return
  try {
    const setting = await loadPushSetting(userId, AsyncStorage)
    if (!setting.enabled) {
      // オフにしたのにサーバーの登録を外せていなければ送り直す。失敗は通知一覧で再試行できる
      if (setting.removalPending) await completePendingRemoval(userId, AsyncStorage, () => unregisterPushToken(userId))
      return
    }
  } catch {
    console.warn('[Push] Failed to read the push notification setting or remove the subscription')
    return
  }

  // Android 13+ はチャンネルが無いと許可ダイアログが出ない
  try {
    await ensureAndroidNotificationChannel()
  } catch {
    console.warn('[Push] Failed to create the Android notification channel')
  }
  // 起動時の要求に失敗しても、通知一覧の案内が許可状態を確かめ直してエラーや導線を出すため、ここでは記録して終える
  let status: Notifications.PermissionStatus
  try {
    ;({ status } = await Notifications.requestPermissionsAsync())
  } catch {
    console.warn('[Push] Failed to request notification permission')
    return
  }
  if (status !== 'granted') return

  try {
    await registerPushToken(userId, () => loadPushEnabled(userId, AsyncStorage))
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
    onUnavailable: (message) => Alert.alert(message),
  })
}

export default function AppLayout() {
  const router = useRouter()
  const t = useT()
  // 言語が決まってからリスナーを張り直すと、起動時の通知で二重に遷移する。
  const tRef = React.useRef(t)
  tRef.current = t

  const userId = useSession()?.user.id ?? null
  React.useEffect(() => {
    if (userId) void requestAndRegisterPush(userId)
  }, [userId])

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
              <AppModalHost />
            </ProjectsViewProvider>
          </NotificationPanelProvider>
        </AppearanceProvider>
      </OfflineMessageQueueProvider>
    </RealtimeProvider>
  )
}
