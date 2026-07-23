import React from 'react'
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api-fetch'
import { API_BASE_URL as WEB_BASE } from '../lib/env'
import { webPath } from '../lib/webview-path'
import { isAccentId, isAppearanceTheme } from '@cairn/shared'
import { useAppAppearance } from './appearance-provider'
import {
  NATIVE_HEADER_BACK_SCRIPT,
  parseNativeHeaderDescriptor,
  type NativeHeaderDescriptor,
} from '../lib/native-header-bridge'

export interface AppWebViewHandle {
  injectJavaScript: (script: string) => void
  triggerNativeHeaderBack: () => void
}

export interface AppWebViewProps {
  path: string
  onLoadEnd?: () => void
  allowChatRoutes?: boolean
  includeSafeAreaTop?: boolean
  onNativeHeaderChange?: (header: NativeHeaderDescriptor) => void
}

export function webUrl(path: string): string {
  return `${WEB_BASE}${webPath(path)}`
}

export const AppWebView = React.forwardRef<AppWebViewHandle, AppWebViewProps>(function AppWebView(
  { path, onLoadEnd, allowChatRoutes = false, includeSafeAreaTop = true, onNativeHeaderChange },
  ref,
) {
  const webViewRef = React.useRef<WebView>(null)
  const [uri, setUri] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)
  const insets = useSafeAreaInsets()
  const { palette, updateAppearance } = useAppAppearance()
  const bg = palette.bg
  const router = useRouter()

  React.useImperativeHandle(
    ref,
    () => ({
      injectJavaScript: (script) => webViewRef.current?.injectJavaScript(script),
      triggerNativeHeaderBack: () =>
        webViewRef.current?.injectJavaScript(NATIVE_HEADER_BACK_SCRIPT),
    }),
    [],
  )

  // 最新の path を参照するための ref（onLoadEnd など描画外コールバックから使う）
  const pathRef = React.useRef(path)
  pathRef.current = path
  // ハンドオフに使った初期 path。これと異なる path への切り替えは内部遷移で処理する
  const initialPathRef = React.useRef<string | null>(null)
  // 初回ロード完了フラグ。完了前は injectJavaScript が失われるため遷移を保留する
  const loadedRef = React.useRef(false)
  // HANDOFF_FAILED 起因の再ハンドオフは 1 回だけ（無限リトライ防止）
  const retriedRef = React.useRef(false)
  // 復帰処理中は URL 監視による signOut を一時停止する
  const recoveringRef = React.useRef(false)

  // WEB_BASE のオリジン（scheme+host+port）を抽出して信頼済みオリジンとする
  const trustedOrigin = WEB_BASE.replace(/\/$/, '').replace(/(https?:\/\/[^/]+).*/, '$1')

  const performHandoff = React.useCallback(
    async (targetPath: string) => {
      setError(false)

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        // 通常は AuthGuard がセッションを保証するため到達しない
        router.replace('/(auth)/login')
        return
      }

      try {
        // ネイティブの refresh_token を WebView に渡さず、使い捨ての hashed_token を発行する。
        // WebView 側は verifyOtp で独立したセッションを確立する
        // （docs/mobile-webview-auth-handoff.md）。
        const res = await apiFetch('/api/auth/webview-handoff', {
          method: 'POST',
        })
        if (!res.ok) {
          if (res.status === 401) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
            router.replace('/(auth)/login')
            return
          }
          throw new Error(`handoff failed: ${res.status}`)
        }
        const data = (await res.json()) as { tokenHash?: string }
        if (!data.tokenHash) throw new Error('handoff response missing tokenHash')

        const redirect = encodeURIComponent(webPath(targetPath))
        const th = encodeURIComponent(data.tokenHash)
        initialPathRef.current = targetPath
        loadedRef.current = false
        // トークンは URL フラグメント（#th=...）で渡す。
        // フラグメントはサーバーに送信されないためアクセスログに残らない。
        setUri(`${WEB_BASE}/auth/mobile-handoff?redirect=${redirect}#th=${th}`)
      } catch (err) {
        // 失敗理由が Metro ログで追えるように必ず出力する
        console.error('[AppWebView] ハンドオフに失敗:', err)
        setError(true)
      }
    },
    [router],
  )

  // WebView 内の同一オリジンへ内部遷移する（Cookie セッションは生きているため再認証不要）
  const navigateTo = React.useCallback((targetPath: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.assign(${JSON.stringify(webUrl(targetPath))}); true;`,
    )
  }, [])

  React.useEffect(() => {
    if (initialPathRef.current === null) {
      // 初回マウント時のみハンドオフを実行する
      void performHandoff(path)
    } else if (loadedRef.current && path !== initialPathRef.current) {
      // ハンドオフ済み・ロード完了後の path 切り替えは内部遷移で処理する
      navigateTo(path)
    }
    // ロード未完了中の path 変更は onLoadEnd 側で反映する
  }, [path, performHandoff, navigateTo])

  function handleLoadEnd() {
    onLoadEnd?.()
    if (loadedRef.current) return
    loadedRef.current = true
    // ロード完了前に切り替えられていた場合は、最新の path へ追従する
    if (initialPathRef.current !== null && pathRef.current !== initialPathRef.current) {
      navigateTo(pathRef.current)
    }
  }

  async function recoverFromHandoffFailure() {
    recoveringRef.current = true

    if (retriedRef.current) {
      // 2 回目の失敗：トークンを更新しても復帰できないためログアウトする
      await supabase.auth.signOut().catch(() => undefined)
      router.replace('/(auth)/login')
      return
    }
    retriedRef.current = true

    const { data, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !data.session) {
      await supabase.auth.signOut().catch(() => undefined)
      router.replace('/(auth)/login')
      return
    }

    recoveringRef.current = false
    void performHandoff(pathRef.current)
  }

  function handleMessage(event: WebViewMessageEvent) {
    let msg: {
      type?: string
      theme?: unknown
      accentId?: unknown
      title?: unknown
      subtitle?: unknown
      canGoBack?: unknown
    } | null = null
    try {
      msg = JSON.parse(event.nativeEvent.data) as {
        type?: string
        theme?: unknown
        accentId?: unknown
        title?: unknown
        subtitle?: unknown
        canGoBack?: unknown
      }
    } catch {
      return
    }
    if (msg?.type === 'HANDOFF_FAILED') {
      void recoverFromHandoffFailure()
    }
    if (msg?.type === 'open-chats') {
      router.push('/(app)/chats')
    }
    if (msg?.type === 'native-header') {
      const descriptor = parseNativeHeaderDescriptor(msg)
      if (descriptor) onNativeHeaderChange?.(descriptor)
    }
    if (
      msg?.type === 'appearance-changed' &&
      isAppearanceTheme(msg.theme) &&
      isAccentId(msg.accentId)
    ) {
      updateAppearance({ theme: msg.theme, accentId: msg.accentId })
    }
  }

  // Web 側でログアウトして /auth/login に遷移したらネイティブセッションも破棄する
  function handleNavigationStateChange(state: WebViewNavigation) {
    if (recoveringRef.current) return
    const url = state.url
    if (url.includes('/auth/login') || url.includes('/auth/signup')) {
      supabase.auth.signOut().then(() => {
        router.replace('/(auth)/login')
      })
    }
  }

  // WebView 内のチャット導線は、Web ではなくネイティブのチャットタブへ委譲する。
  function handleShouldStartLoadWithRequest(request: WebViewNavigation) {
    const url = request.url
    // about:blank など内部リソースは通す
    if (url === 'about:blank' || url.startsWith('about:')) return true
    const chatsPath = `${trustedOrigin}/chats`
    if (
      !allowChatRoutes &&
      (url === chatsPath || url.startsWith(`${chatsPath}/`) || url.startsWith(`${chatsPath}?`))
    ) {
      router.push('/(app)/chats')
      return false
    }
    // 信頼済みオリジンの HTTPS のみ許可
    return url.startsWith(`${trustedOrigin}/`) || url === trustedOrigin
  }

  if (error) {
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: bg, paddingTop: includeSafeAreaTop ? insets.top : 0 },
        ]}
      >
        <Text style={[styles.errorText, { color: palette.text3 }]}>読み込みに失敗しました</Text>
        <Pressable
          style={[styles.retryButton, { backgroundColor: palette.accent }]}
          onPress={() => void performHandoff(pathRef.current)}
        >
          <Text style={[styles.retryLabel, { color: palette.onAccent }]}>再試行</Text>
        </Pressable>
      </View>
    )
  }

  if (!uri) return <View style={[styles.fill, { backgroundColor: bg }]} />

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: bg, paddingTop: includeSafeAreaTop ? insets.top : 0 },
      ]}
    >
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
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  webview: { flex: 1 },
  errorText: { fontSize: 15 },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryLabel: { fontSize: 15, fontWeight: '600' },
})
