import React from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api-fetch'
import { GoogleSignInButton } from '../../components/google-sign-in-button'

export default function SignupScreen() {
  const router = useRouter()
  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSignup() {
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (!data.session) {
      setError('メール確認が必要です。受信トレイをご確認ください。')
      setLoading(false)
      return
    }

    // profiles + workspace_members を作成する（省くと以降の全 API が 403 になる）
    const res = await apiFetch('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError((body as { error?: string }).error ?? 'プロフィールの作成に失敗しました')
      setLoading(false)
      return
    }

    router.replace('/(app)/projects')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cairn</Text>
      <Text style={styles.subtitle}>新しいアカウントを作成</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="表示名"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
        />
        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（8文字以上）"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>アカウントを作成</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>または</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleSignInButton label="Google で続ける" onError={(m) => setError(m || null)} />

        <View style={styles.legal}>
          <Text style={styles.legalText}>アカウントを作成することで、</Text>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://oss-cairn.com/terms')}
          >
            <Text style={styles.legalLink}>利用規約</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>と</Text>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://oss-cairn.com/privacy')}
          >
            <Text style={styles.legalLink}>プライバシーポリシー</Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>に同意したものとみなします。</Text>
        </View>
      </View>

      <Link href="/(auth)/login" style={styles.link}>
        すでにアカウントをお持ちの方はこちら
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  form: {
    width: '100%',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0070f3',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    color: '#999',
    fontSize: 13,
  },
  link: {
    marginTop: 24,
    color: '#0070f3',
    fontSize: 14,
  },
  legal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    marginTop: 4,
  },
  legalText: {
    color: '#666',
    fontSize: 12,
  },
  legalLink: {
    color: '#0070f3',
    fontSize: 12,
  },
})
