import type { Session } from '@supabase/supabase-js'

/**
 * SecureStore に残っているセッションを読む。圏外でアクセストークンが切れていると、
 * supabase-js は更新に失敗して保存を残したまま null を返すため、保存側から復元して端末キャッシュを開けるようにする。
 * トークン自体は更新しない。回線が戻れば supabase-js が更新して TOKEN_REFRESHED を送る。
 */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as Partial<Session> | null
    if (!session?.access_token || !session.refresh_token || !session.user?.id) return null
    return session as Session
  } catch {
    return null
  }
}
