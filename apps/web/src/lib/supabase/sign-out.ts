import { createClient } from './client'
import { clearAllDrafts } from '@/lib/drafts/draft-store'

export async function signOutCurrentSession(): Promise<boolean> {
  try {
    const { auth } = createClient()
    const { error } = await auth.signOut({ scope: 'local' })
    if (!error) {
      // 共有端末に個人の下書きを残さない（どのサインアウト経路でもここを通る）
      clearAllDrafts()
      return true
    }

    // 更新トークンの失効で SDK が既に Cookie を消した場合も完了として扱う。
    const current = await auth.getSession()
    const ended = !current.error && !current.data.session
    if (ended) clearAllDrafts()
    return ended
  } catch {
    return false
  }
}
