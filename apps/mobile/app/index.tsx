import React from 'react'
import { Redirect } from 'expo-router'
import { getNetworkStateAsync } from 'expo-network'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSession } from '../lib/session-context'
import { apiFetch } from '../lib/api-fetch'
import { shouldAttemptNetworkRequest } from '../lib/network-state'
import { hasOfflineCache } from '../lib/offline-cache-store'
import { useT } from '../components/locale-provider'

export default function Index() {
  const t = useT()
  const session = useSession()
  const [needsWorkspace, setNeedsWorkspace] = React.useState<boolean | null>(null)
  const [setupFailed, setSetupFailed] = React.useState(false)
  const [retry, setRetry] = React.useState(0)

  React.useEffect(() => {
    if (!session) return
    setSetupFailed(false)
    const userId = session.user.id
    let cancelled = false

    void (async () => {
      // 端末キャッシュがあるユーザーは設定済みなので、通信できなければ確認せず一覧へ進む。
      // キャッシュが無ければ確認の失敗を出す
      const networkState = await getNetworkStateAsync().catch(() => ({}))
      if (!shouldAttemptNetworkRequest(networkState) && (await hasOfflineCache(userId))) {
        if (!cancelled) setNeedsWorkspace(false)
        return
      }
      let res: Response
      try {
        res = await apiFetch('/api/auth/setup', { method: 'POST', body: JSON.stringify({}) })
      } catch {
        const cached = await hasOfflineCache(userId)
        if (cancelled) return
        if (cached) setNeedsWorkspace(false)
        else setSetupFailed(true)
        return
      }
      try {
        if (!res.ok) throw new Error('setup check failed')
        const body = (await res.json()) as { needsWorkspace?: boolean }
        if (!cancelled) setNeedsWorkspace(body.needsWorkspace === true)
      } catch {
        if (!cancelled) setSetupFailed(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [retry, session])

  // AuthGuard が復元完了までルートを描画しないため通常ここには来ないが、念のため
  if (session === undefined) return null

  if (session && setupFailed) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{t('Could not check whether your account is ready.')}</Text>
        <Pressable style={styles.button} onPress={() => setRetry((value) => value + 1)}>
          <Text style={styles.buttonText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    )
  }

  // 無条件に login へ飛ばすとログイン済みでも一瞬ログイン画面が表示されるため、
  // セッションの有無で直接行き先を分岐する
  if (session && needsWorkspace === null) return null
  return <Redirect href={session ? (needsWorkspace ? '/onboarding' : '/(app)/chats') : '/(auth)/login'} />
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { color: '#374151', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
