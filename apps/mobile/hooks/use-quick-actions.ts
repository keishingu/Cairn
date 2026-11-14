import React from 'react'
import { Alert, AppState, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import * as QuickActions from 'expo-quick-actions'
import { FEATURE_FLAGS } from '@cairn/shared'
import { useT } from '../components/locale-provider'
import { followNotification } from '../lib/follow-notification'
import {
  buildQuickActionItems,
  createQuickActionInbox,
  createQuickActionRegistrar,
  quickActionIdFrom,
  routeFromQuickAction,
} from '../lib/quick-actions'
import { useSession } from '../lib/session-context'

const registrar = createQuickActionRegistrar(
  (items) => QuickActions.setItems(items),
  (error) => console.warn('[quick-actions] 項目を登録できませんでした', error),
)
const inbox = createQuickActionInbox()

// initial はプロセスが続く間ずっと同じ値を返すため、ログインし直しなどで再度開かないよう 1 回だけ読む
let initialActionRead = false

function receiveQuickAction(action: QuickActions.Action): void {
  const id = quickActionIdFrom(action.id)
  if (id) inbox.receive(id)
  else console.warn('[quick-actions] 未知の項目です', action.id)
}

export function refreshQuickActions(): Promise<void> {
  return registrar.refresh()
}

/** 項目を表示言語で登録し、押された操作を受け取る。文言が profiles.locale に追従するよう、ネイティブの静的定義は使わない */
export function useQuickActionsRegistration(): void {
  const t = useT()
  const items = React.useMemo(
    () => buildQuickActionItems({ platform: Platform.OS, dmEnabled: FEATURE_FLAGS.dm, t }),
    [t],
  )

  React.useEffect(() => {
    void registrar.sync(items)
  }, [items])

  // 別アイコンへの切り替えはバックグラウンドで起きるため、前面に戻ったときも登録し直す
  React.useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshQuickActions()
    })
    return () => sub.remove()
  }, [])

  React.useEffect(() => {
    if (!initialActionRead) {
      initialActionRead = true
      if (QuickActions.initial) receiveQuickAction(QuickActions.initial)
    }
    const sub = QuickActions.addListener(receiveQuickAction)
    return () => sub.remove()
  }, [])
}

/** 預かった操作の画面へ移る。(app) はログイン後にだけ描画されるので、未ログインで押した操作はここで再開する */
export function useQuickActionNavigation(): void {
  const router = useRouter()
  const t = useT()
  const signedIn = !!useSession()
  const pending = React.useSyncExternalStore(inbox.subscribe, inbox.peek)

  React.useEffect(() => {
    if (!signedIn || !pending) return
    const id = inbox.take()
    if (!id) return
    void followNotification(router, routeFromQuickAction(id, Date.now().toString(36)), {
      t,
      onUnavailable: (message) => Alert.alert(message),
    })
  }, [pending, router, signedIn, t])
}
