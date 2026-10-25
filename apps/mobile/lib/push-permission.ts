export type PushPermissionView = 'granted' | 'request' | 'open-settings'

/**
 * OS の許可状態から、通知画面で見せる導線を決める。
 * iOS は一度拒否すると再度ダイアログを出せず、Android 13+ も2回拒否すると出せなくなるため、
 * canAskAgain が false なら設定アプリへ案内する。
 * Android 13+ は実行時権限が許可済み（granted）でも、設定アプリで通知をオフにすると status が denied になる。
 * このときダイアログでは戻せないため、設定アプリへ案内する。
 * Android 8+ はアプリ全体の通知がオンでも、通知が届くチャンネルだけをオフにできる。これもダイアログでは戻せないため、設定アプリへ案内する。
 */
export function pushPermissionView(
  permission: {
    status: string
    granted: boolean
    canAskAgain: boolean
  },
  options: { channelDisabled?: boolean } = {},
): PushPermissionView {
  if (permission.granted && permission.status === 'granted') return options.channelDisabled ? 'open-settings' : 'granted'
  if (permission.granted) return 'open-settings'
  return permission.canAskAgain ? 'request' : 'open-settings'
}
