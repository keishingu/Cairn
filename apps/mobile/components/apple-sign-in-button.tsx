import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import { signInWithApple } from '../lib/oauth'
import { completePostAuthNavigation } from '../lib/auth-navigation'

interface Props {
  buttonType: AppleAuthentication.AppleAuthenticationButtonType
  onError: (message: string) => void
}

export function AppleSignInButton({ buttonType, onError }: Props) {
  const router = useRouter()
  const [available, setAvailable] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const loadingRef = React.useRef(false)

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return

    void AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false))
  }, [])

  async function handlePress() {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    onError('')
    try {
      // キャンセルはログイン画面に戻る通常操作なので、エラーを表示しない。
      const result = await signInWithApple()
      if (result === 'needs-workspace') router.replace('/(app)/onboarding')
      else if (result === 'success') router.replace('/(app)/projects')
    } catch {
      onError('Appleでのサインインに失敗しました。しばらくしてからもう一度お試しください。')
    } finally {
      completePostAuthNavigation()
      loadingRef.current = false
      setLoading(false)
    }
  }

  // Apple公式ボタンはiOSで利用可能な場合だけ描画する。Android/Webへネイティブ依存を出さない。
  if (!available) return null

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={buttonType}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={8}
      style={[styles.button, loading && styles.loading]}
      onPress={handlePress}
      accessibilityLabel="Appleでサインイン"
      accessibilityState={{ disabled: loading, busy: loading }}
    />
  )
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 48,
  },
  loading: {
    opacity: 0.6,
  },
})
