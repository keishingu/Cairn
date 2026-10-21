import React from 'react'
import { AppState, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { pushPermissionView, type PushPermissionView } from '../lib/push-permission'
import { registerPushToken, supportsNotifications } from '../lib/push-registration'

type PushPermissionState =
  | { status: 'unsupported' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: PushPermissionView; registerFailed: boolean }

export function usePushPermission() {
  const [state, setState] = React.useState<PushPermissionState>(
    supportsNotifications ? { status: 'loading' } : { status: 'unsupported' },
  )
  const [requesting, setRequesting] = React.useState(false)

  const apply = React.useCallback(async (permission: Notifications.NotificationPermissionsStatus) => {
    const view = pushPermissionView(permission)
    if (view !== 'granted') {
      setState({ status: view, registerFailed: false })
      return
    }
    try {
      await registerPushToken()
      setState({ status: 'granted', registerFailed: false })
    } catch {
      setState({ status: 'granted', registerFailed: true })
    }
  }, [])

  const refresh = React.useCallback(async () => {
    if (!supportsNotifications) return
    try {
      await apply(await Notifications.getPermissionsAsync())
    } catch {
      setState({ status: 'error' })
    }
  }, [apply])

  // 設定アプリで許可して戻ってきたときに、表示とトークン登録を追従させる
  React.useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const request = React.useCallback(async () => {
    setRequesting(true)
    try {
      await apply(await Notifications.requestPermissionsAsync())
    } catch {
      setState({ status: 'error' })
    } finally {
      setRequesting(false)
    }
  }, [apply])

  const openSettings = React.useCallback(() => {
    void Linking.openSettings()
  }, [])

  return { state, requesting, request, openSettings, retry: refresh }
}
