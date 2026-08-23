import React from 'react'
import { Redirect } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSession } from '../lib/session-context'
import { apiFetch } from '../lib/api-fetch'

export default function Index() {
  const session = useSession()
  const [needsWorkspace, setNeedsWorkspace] = React.useState<boolean | null>(null)
  const [setupFailed, setSetupFailed] = React.useState(false)
  const [retry, setRetry] = React.useState(0)

  React.useEffect(() => {
    if (!session) return
    setSetupFailed(false)
    void apiFetch('/api/auth/setup', { method: 'POST', body: JSON.stringify({}) })
      .then(async (res) => {
        if (!res.ok) throw new Error('setup check failed')
        return res.json() as Promise<{ needsWorkspace?: boolean }>
      })
      .then((body: { needsWorkspace?: boolean }) => setNeedsWorkspace(body.needsWorkspace === true))
      .catch(() => setSetupFailed(true))
  }, [retry, session])

  // AuthGuard が復元完了までルートを描画しないため通常ここには来ないが、念のため
  if (session === undefined) return null

  if (session && setupFailed) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>アカウントの準備状況を確認できませんでした。</Text>
        <Pressable style={styles.button} onPress={() => setRetry((value) => value + 1)}>
          <Text style={styles.buttonText}>再試行</Text>
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
