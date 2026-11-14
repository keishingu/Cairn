import { isDeviceOffline } from './device-offline'
import { clearDeviceSession, supabase } from './supabase'

/**
 * サーバーのセッションを失効させてサインアウトする。届かなければ端末側だけでも必ず消す
 * （signOut は通信失敗で例外を投げず、セッションと端末キャッシュが残って無反応に見える）。
 * 明示的に圏外なら、トークン切れの更新失敗を待たないよう送らない。
 */
export async function signOutFromDevice(): Promise<void> {
  try {
    if (!(await isDeviceOffline())) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (!error) return
      console.warn('[auth] サーバーのセッションを失効できませんでした')
    }
    await clearDeviceSession()
  } catch {
    console.error('[auth] サインアウトに失敗しました')
  }
}
