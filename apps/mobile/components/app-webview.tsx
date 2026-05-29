import React from 'react'
import { Platform, View, StyleSheet, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewNavigation } from 'react-native-webview'
import { supabase } from '../lib/supabase'

const WEB_BASE = process.env['EXPO_PUBLIC_API_BASE_URL']!

// Web 側の globals.css --bg と揃える
const BG_DARK = '#0B0F14'
const BG_LIGHT = '#F8FAFC'

interface Props {
  path: string
}

export function AppWebView({ path }: Props) {
  const webViewRef = React.useRef<WebView>(null)
  const [uri, setUri] = React.useState<string | null>(null)
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const bg = colorScheme === 'dark' ? BG_DARK : BG_LIGHT
  const router = useRouter()

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const { access_token, refresh_token } = session
      const redirect = encodeURIComponent(`${path}?webview=1`)

      // トークンを URL フラグメント（#）で渡す。
      // フラグメントはサーバーに送信されないためアクセスログに残らない。
      // injectedJavaScriptBeforeContentLoaded の sessionStorage 書き込みは
      // iOS/Android 実機では別 JS コンテキストで実行されページから参照できないため廃止。
      const at = encodeURIComponent(access_token)
      const rt = encodeURIComponent(refresh_token)
      setUri(`${WEB_BASE}/auth/mobile-handoff?redirect=${redirect}#at=${at}&rt=${rt}`)
    })
  }, [path])

  // Web 側でログアウトして /auth/login に遷移したらネイティブセッションも破棄する
  function handleNavigationStateChange(state: WebViewNavigation) {
    const url = state.url
    if (url.includes('/auth/login') || url.includes('/auth/signup')) {
      supabase.auth.signOut().then(() => {
        router.replace('/(auth)/login')
      })
    }
  }

  if (!uri) return <View style={[styles.fill, { backgroundColor: bg }]} />

  return (
    <View style={[styles.fill, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        source={{ uri }}
        style={styles.webview}
        originWhitelist={['https://*', 'http://*']}
        // iOS スワイプバック（ブラウザの進む/戻るジェスチャー）
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        onNavigationStateChange={handleNavigationStateChange}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webview: { flex: 1 },
})
