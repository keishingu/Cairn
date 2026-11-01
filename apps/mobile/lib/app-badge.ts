import { shouldClearAccountCache } from './account-cache'

// 通知の invalidate（['notifications']）に一緒に乗るよう、通知のキーの下に置く
export const appBadgeQueryKey = ['notifications', 'badge-count'] as const

export const APP_BADGE_COUNT_PATH = '/api/notifications/badge-count'

/** サーバーの応答から件数を取り出す。形が違えば 0 と見なさず失敗にする（既存のバッジを消さないため）。 */
export function parseAppBadgeCount(body: unknown): number {
  const count = (body as { count?: unknown } | null)?.count
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('未読バッジ数の応答が不正です')
  }
  return count
}

/**
 * サインアウトと別ユーザーへの入れ替えで、前のアカウントの数字をアイコンに残さない。
 * previousUserId が undefined の起動直後も、未ログインならセッション切れの古い数字を消す。
 */
export function shouldClearAppBadge(
  event: string,
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  if (nextUserId === null) return true
  return previousUserId !== undefined && shouldClearAccountCache(event, previousUserId, nextUserId)
}

/**
 * OS のアイコンへ反映する。false は端末がバッジを持たない・表示できないだけなのでエラーにしない
 * （Android のランチャーや、iOS でバッジの許可がないとき）。
 */
export async function applyAppBadge(
  count: number,
  setBadgeCount: (count: number) => Promise<boolean>,
): Promise<void> {
  try {
    await setBadgeCount(count)
  } catch (error) {
    console.warn('[AppBadge] Failed to update the app icon badge', error)
  }
}
