import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { signInWithApple } from '../lib/oauth'

interface Props {
  buttonType: AppleAuthentication.AppleAuthenticationButtonType
  onError: (message: string) => void
}

export function AppleSignInButton({ buttonType, onError }: Props) {
  const [available, setAvailable] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return

    void AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false))
  }, [])

  async function handlePress() {
    setLoading(true)
    onError('')
    try {
      // キャンセルはログイン画面に戻る通常操作なので、エラーを表示しない。
      await signInWithApple()
    } catch {
      onError('Appleでのサインインに失敗しました。しばらくしてからもう一度お試しください。')
    } finally {
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
