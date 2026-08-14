import React from 'react'
import { Redirect } from 'expo-router'
import { useSession } from '../lib/session-context'
import { apiFetch } from '../lib/api-fetch'

export default function Index() {
  const session = useSession()
  const [needsWorkspace, setNeedsWorkspace] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (!session) return
    void apiFetch('/api/auth/setup', { method: 'POST', body: JSON.stringify({}) })
      .then((res) => (res.ok ? res.json() : {}))
      .then((body: { needsWorkspace?: boolean }) => setNeedsWorkspace(body.needsWorkspace === true))
      .catch(() => setNeedsWorkspace(false))
  }, [session])

  // AuthGuard が復元完了までルートを描画しないため通常ここには来ないが、念のため
  if (session === undefined) return null

  // 無条件に login へ飛ばすとログイン済みでも一瞬ログイン画面が表示されるため、
  // セッションの有無で直接行き先を分岐する
  if (session && needsWorkspace === null) return null
  return <Redirect href={session ? (needsWorkspace ? '/onboarding' : '/(app)/projects') : '/(auth)/login'} />
}
