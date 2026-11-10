import { createClient } from './client'

export async function signOutCurrentSession(): Promise<boolean> {
  try {
    const { auth } = createClient()
    const { error } = await auth.signOut({ scope: 'local' })
    if (!error) return true

    // 更新トークンの失効で SDK が既に Cookie を消した場合も完了として扱う。
    const current = await auth.getSession()
    return !current.error && !current.data.session
  } catch {
    return false
  }
}
