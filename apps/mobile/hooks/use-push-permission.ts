import React from 'react'
import { AppState, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { pushPermissionView, type PushPermissionView } from '../lib/push-permission'
import {
  completePendingRemoval,
  loadPushEnabled,
  loadPushSetting,
  savePushEnabled,
  subscribePushPreference,
} from '../lib/push-preference'
import {
  ensureAndroidNotificationChannel,
  isAndroidNotificationChannelDisabled,
  registerPushToken,
  supportsNotifications,
  unregisterPushToken,
} from '../lib/push-registration'
import { useSession } from '../lib/session-context'

type PushPermissionState =
  | { status: 'unsupported' }
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: PushPermissionView
      /** 通知一覧のスイッチでオフにしていないか（端末内・ユーザーごと） */
      enabled: boolean
      /** サーバーへの登録・解除に失敗したか。失敗したほうを再試行する */
      syncFailed: 'register' | 'unregister' | null
    }

export function usePushPermission() {
  const userId = useSession()?.user.id ?? null
  const [state, setState] = React.useState<PushPermissionState>(
    supportsNotifications ? { status: 'loading' } : { status: 'unsupported' },
  )
  const [busy, setBusy] = React.useState(false)

  // 復帰時・再試行・切り替えが重なったとき、後から終わった古い結果で上書きしない。アンマウント後の更新も止める
  const seq = React.useRef(0)

  const apply = React.useCallback(
    async (permission: Notifications.NotificationPermissionsStatus, enabled: boolean, id: number) => {
      // アプリ全体は許可済みでも、通知が届くチャンネルだけがオフなら届かないのでオン表示にしない
      const channelDisabled = permission.granted ? await isAndroidNotificationChannelDisabled() : false
      const view = pushPermissionView(permission, { channelDisabled })
      // 許可状態は先に見せる。登録を待つと、その間（決着しなければずっと）何も表示されない
      if (id === seq.current) setState({ status: view, enabled, syncFailed: null })
      if (view !== 'granted' || !enabled || !userId) return
      try {
        // 登録の順番が来るまでにオフにされたら登録しない
        await registerPushToken(() => loadPushEnabled(userId, AsyncStorage))
      } catch {
        if (id === seq.current) setState({ status: view, enabled, syncFailed: 'register' })
      }
    },
    [userId],
  )

  // オフにしたのにサーバーの登録を外せていなければ、外せるまで送り直す（アプリの終了や通信失敗で残らないように）
  const retryPendingRemoval = React.useCallback(async (uid: string, id: number) => {
    try {
      await completePendingRemoval(uid, AsyncStorage, unregisterPushToken)
    } catch {
      if (id === seq.current) {
        setState((current) => ('syncFailed' in current ? { ...current, syncFailed: 'unregister' } : current))
      }
    }
  }, [])

  const refresh = React.useCallback(async () => {
    if (!supportsNotifications || !userId) return
    const id = ++seq.current
    try {
      const [permission, setting] = await Promise.all([
        Notifications.getPermissionsAsync(),
        loadPushSetting(userId, AsyncStorage),
      ])
      await apply(permission, setting.enabled, id)
      if (setting.removalPending) await retryPendingRemoval(userId, id)
    } catch {
      if (id === seq.current) setState({ status: 'error' })
    }
  }, [apply, retryPendingRemoval, userId])

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

  // スイッチは通知パネルと通知画面の両方にある。もう片方で変えたら読み直す
  const source = React.useRef({})
  React.useEffect(
    () =>
      subscribePushPreference((changedUserId, changedBy) => {
        if (changedUserId === userId && changedBy !== source.current) void refresh()
      }),
    [refresh, userId],
  )

  const turnOn = React.useCallback(async () => {
    if (!userId || state.status === 'unsupported' || state.status === 'loading') return
    const id = ++seq.current
    setBusy(true)
    try {
      await savePushEnabled(userId, true, AsyncStorage, source.current)
      if (state.status === 'open-settings') {
        // ダイアログを出せないので設定アプリで許可してもらう。戻ったときの refresh で登録する
        await Linking.openSettings()
        return
      }
      // Android 13+ はチャンネルが無いと許可ダイアログが出ない
      await ensureAndroidNotificationChannel()
      // 許可済みならダイアログは出ずにそのまま許可状態が返る
      await apply(await Notifications.requestPermissionsAsync(), true, id)
    } catch {
      if (id === seq.current) setState({ status: 'error' })
    } finally {
      // iOS は許可ダイアログで inactive → active を経て refresh が割り込むため、連番に関係なく解除する
      setBusy(false)
    }
  }, [apply, state.status, userId])

  const turnOff = React.useCallback(async () => {
    if (!userId || state.status === 'unsupported' || state.status === 'loading' || state.status === 'error') return
    const id = ++seq.current
    const view = state.status
    setBusy(true)
    try {
      // 先に「解除待ち」として保存する。解除前にアプリが終了したり失敗したりしても、次の起動や表示更新で解除を送り直す
      await savePushEnabled(userId, false, AsyncStorage, source.current)
      if (id === seq.current) setState({ status: view, enabled: false, syncFailed: null })
      await completePendingRemoval(userId, AsyncStorage, unregisterPushToken)
    } catch {
      if (id === seq.current) setState({ status: view, enabled: false, syncFailed: 'unregister' })
    } finally {
      setBusy(false)
    }
  }, [state.status, userId])

  const retry = React.useCallback(async () => {
    if (state.status !== 'error' && 'syncFailed' in state && state.syncFailed === 'unregister') {
      await turnOff()
      return
    }
    await refresh()
  }, [refresh, state, turnOff])

  return { state, busy, turnOn, turnOff, retry }
}
