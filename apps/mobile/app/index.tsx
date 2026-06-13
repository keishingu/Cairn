import { Redirect } from 'expo-router'
import { useSession } from '../lib/session-context'

export default function Index() {
  const session = useSession()

  // AuthGuard が復元完了までルートを描画しないため通常ここには来ないが、念のため
  if (session === undefined) return null

  // 無条件に login へ飛ばすとログイン済みでも一瞬ログイン画面が表示されるため、
  // セッションの有無で直接行き先を分岐する
  return <Redirect href={session ? '/(app)/projects' : '/(auth)/login'} />
}
