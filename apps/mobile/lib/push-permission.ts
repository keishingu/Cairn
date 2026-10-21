export type PushPermissionView = 'granted' | 'request' | 'open-settings'

/**
 * OS の許可状態から、通知画面で見せる導線を決める。
 * iOS は一度拒否すると再度ダイアログを出せず、Android 13+ も2回拒否すると出せなくなるため、
 * canAskAgain が false なら設定アプリへ案内する。
 */
export function pushPermissionView(permission: {
  granted: boolean
  canAskAgain: boolean
}): PushPermissionView {
  if (permission.granted) return 'granted'
  return permission.canAskAgain ? 'request' : 'open-settings'
}
