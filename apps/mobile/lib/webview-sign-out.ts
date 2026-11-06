import AsyncStorage from '@react-native-async-storage/async-storage'

// 旧 Web のログアウトページは全端末のセッションを失効させるため別の URL を使う。
export const WEBVIEW_DEVICE_SIGN_OUT_PATH = '/auth/mobile-device-signout'

const pendingKey = 'cairn:webview-signout-pending'
let pendingCleanup: Promise<boolean> | undefined

export async function markWebViewSignOutPending(): Promise<void> {
  await pendingCleanup
  await AsyncStorage.setItem(pendingKey, '1')
}

// WebView は Cookie を共有する。新しいハンドオフの前に、残ったセッションを一度だけ片付ける。
export function finishPendingWebViewSignOut(signOut: () => Promise<boolean>): Promise<boolean> {
  pendingCleanup ??= (async () => {
    if (!(await AsyncStorage.getItem(pendingKey))) return true
    if (!(await signOut())) return false
    await AsyncStorage.removeItem(pendingKey)
    return true
  })().finally(() => {
    pendingCleanup = undefined
  })
  return pendingCleanup
}
