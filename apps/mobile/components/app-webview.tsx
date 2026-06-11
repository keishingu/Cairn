import React from 'react'
import { Platform, View, StyleSheet, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview'
import { supabase } from '../lib/supabase'
import { API_BASE_URL as WEB_BASE } from '../lib/env'

// Web 側の globals.css --bg と揃える
const BG_DARK = '#0B0F14'
const BG_LIGHT = '#F8FAFC'

export interface AppWebViewHandle {
  injectJavaScript: (js: string) => void
}

interface Props {
  path: string
  // WebView の読み込み完了時。ネイティブの状態を inject で再反映する用途に使う
  onLoadEnd?: () => void
}

export const AppWebView = React.forwardRef<AppWebViewHandle, Props>(function AppWebView(
  { path, onLoadEnd },
  ref,
) {
  const webViewRef = React.useRef<WebView>(null)
  const [uri, setUri] = React.useState<string | null>(null)
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const bg = colorScheme === 'dark' ? BG_DARK : BG_LIGHT
  const router = useRouter()

  React.useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => webViewRef.current?.injectJavaScript(js),
  }), [])

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

  // WEB_BASE のオリジン（scheme+host+port）を抽出して信頼済みオリジンとする
  const trustedOrigin = WEB_BASE.replace(/\/$/, '').replace(/(https?:\/\/[^/]+).*/, '$1')

  // Web 側でログアウトして /auth/login に遷移したらネイティブセッションも破棄する
  function handleNavigationStateChange(state: WebViewNavigation) {
    const url = state.url
    if (url.includes('/auth/login') || url.includes('/auth/signup')) {
      supabase.auth.signOut().then(() => {
        router.replace('/(auth)/login')
      })
    }
  }

  // Web 側（mobile-shell.tsx）からの postMessage を受け取る。
  // クライアントサイド遷移で /chats に入った場合はネイティブのチャットタブへ委譲する
  function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type?: string }
      if (msg.type === 'open-chats') router.push('/(app)/chats')
    } catch {
      // WebView 内の他ライブラリ由来のメッセージは無視する
    }
  }

  // 信頼済みオリジン以外へのナビゲーションをブロック（HTTPS のみ許可）。
  // チャットへのリンクは WebView 内で開かず、ネイティブのチャットタブへ委譲する。
  function handleShouldStartLoadWithRequest(request: WebViewNavigation) {
    const url = request.url
    // about:blank など内部リソースは通す
    if (url === 'about:blank' || url.startsWith('about:')) return true

    const chatPath = `${trustedOrigin}/chats`
    if (url === chatPath || url.startsWith(`${chatPath}/`) || url.startsWith(`${chatPath}?`)) {
      router.push('/(app)/chats')
      return false
    }

    // 信頼済みオリジンの HTTPS のみ許可
    return url.startsWith(`${trustedOrigin}/`) || url === trustedOrigin
  }

  if (!uri) return <View style={[styles.fill, { backgroundColor: bg }]} />

  return (
    <View style={[styles.fill, { backgroundColor: bg, paddingTop: insets.top }]}>
      <WebView
        ref={webViewRef}
        source={{ uri }}
        style={styles.webview}
        originWhitelist={[trustedOrigin, `${trustedOrigin}/*`, 'about:*']}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        // iOS スワイプバック（ブラウザの進む/戻るジェスチャー）
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        {...(onLoadEnd ? { onLoadEnd } : {})}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webview: { flex: 1 },
})
