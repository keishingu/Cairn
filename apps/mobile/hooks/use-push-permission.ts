import React from 'react'
import { AppState, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { pushPermissionView, type PushPermissionView } from '../lib/push-permission'
import { ensureAndroidNotificationChannel, registerPushToken, supportsNotifications } from '../lib/push-registration'

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

  // 復帰時・再試行・許可要求が重なったとき、後から終わった古い結果で上書きしない。アンマウント後の更新も止める
  const seq = React.useRef(0)

  const apply = React.useCallback(async (permission: Notifications.NotificationPermissionsStatus, id: number) => {
    const view = pushPermissionView(permission)
    if (view !== 'granted') {
      if (id === seq.current) setState({ status: view, registerFailed: false })
      return
    }
    try {
      await registerPushToken()
      if (id === seq.current) setState({ status: 'granted', registerFailed: false })
    } catch {
      if (id === seq.current) setState({ status: 'granted', registerFailed: true })
    }
  }, [])

  const refresh = React.useCallback(async () => {
    if (!supportsNotifications) return
    const id = ++seq.current
    try {
      await apply(await Notifications.getPermissionsAsync(), id)
    } catch {
      if (id === seq.current) setState({ status: 'error' })
    }
  }, [apply])

  // 設定アプリで許可して戻ってきたときに、表示とトークン登録を追従させる
  React.useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => {
      sub.remove()
      seq.current++
    }
  }, [refresh])

  const request = React.useCallback(async () => {
    const id = ++seq.current
    setRequesting(true)
    try {
      // Android 13+ はチャンネルが無いと許可ダイアログが出ない
      await ensureAndroidNotificationChannel()
      await apply(await Notifications.requestPermissionsAsync(), id)
    } catch {
      if (id === seq.current) setState({ status: 'error' })
    } finally {
      // iOS は許可ダイアログで inactive → active を経て refresh が割り込むため、連番に関係なく解除する
      setRequesting(false)
    }
  }, [apply])

  const openSettings = React.useCallback(() => {
    void Linking.openSettings()
  }, [])

  return { state, requesting, request, openSettings, retry: refresh }
}
