import React from 'react'
import { Alert, Linking, Platform, View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewProps, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview'
import { loadStoredSession, supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api-fetch'
import { requestWebViewHandoff } from '../lib/webview-handoff'
import {
  finishPendingWebViewSignOut,
  markWebViewSignOutPending,
  WEBVIEW_DEVICE_SIGN_OUT_PATH,
} from '../lib/webview-sign-out'
import { signOutFromDevice } from '../lib/sign-out'
import { unregisterPushTokenForSignOut } from '../lib/push-registration'
import { useSession } from '../lib/session-context'
import { isDeviceOffline } from '../lib/device-offline'
import { API_BASE_URL as WEB_BASE } from '../lib/env'
import { mobileHandoffUrl, webPath } from '../lib/webview-path'
import { isAccentId, isAppearanceTheme, isLocalePreference } from '@cairn/shared'
import { useAppAppearance } from './appearance-provider'
import { useAppLocale, useT } from './locale-provider'
import {
  NATIVE_HEADER_BACK_SCRIPT,
  parseNativeHeaderDescriptor,
  type NativeHeaderDescriptor,
} from '../lib/native-header-bridge'
import { decideWebViewNavigation, WEBVIEW_ORIGIN_WHITELIST } from '../lib/webview-navigation'
import { chatLinkTarget, type ChatLinkTarget } from '../lib/chat-link'
import { parseWebViewDownloadRequest, type WebViewDownloadRequest } from '../lib/webview-download'
import { shareCachedAttachment } from '../lib/attachment-cache'
import { followNotification } from '../lib/follow-notification'
import {
  ACCOUNT_DELETED_LOGIN_ROUTE,
  finishNativeAccountDeletion,
} from '../lib/account-deletion-bridge'
import {
  LINK_APPLE_IDENTITY_MESSAGE_TYPE,
  LINK_GOOGLE_IDENTITY_MESSAGE_TYPE,
  buildAppleIdentityLinkedScript,
  buildGoogleIdentityLinkedScript,
  linkAppleIdentity,
  linkGoogleIdentity,
  type NativeOAuthIdentityLinkResult,
} from '../lib/apple-identity-bridge'

const WEBVIEW_SIGN_OUT_TIMEOUT_MS = 10_000

type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0]

export interface AppWebViewHandle {
  injectJavaScript: (script: string) => void
  triggerNativeHeaderBack: () => void
}

export interface AppWebViewProps {
  path: string
  onLoadEnd?: () => void
  onWebPathChange?: (path: string) => void
  allowChatRoutes?: boolean
  includeSafeAreaTop?: boolean
  onNativeHeaderChange?: (header: NativeHeaderDescriptor) => void
  /** Web 側の focus() でキーボードを出せるようにする（iOS の WebView は既定でユーザー操作を要求する） */
  allowProgrammaticFocus?: boolean
}

export function webUrl(path: string): string {
  return `${WEB_BASE}${webPath(path)}`
}

export const AppWebView = React.forwardRef<AppWebViewHandle, AppWebViewProps>(function AppWebView(
  {
    path,
    onLoadEnd,
    onWebPathChange,
    allowChatRoutes = false,
    includeSafeAreaTop = true,
    onNativeHeaderChange,
    allowProgrammaticFocus = false,
  },
  ref,
) {
  const t = useT()
  const webViewRef = React.useRef<WebView>(null)
  const [uri, setUri] = React.useState<string | null>(null)
  const [error, setError] = React.useState<'offline' | 'failed' | null>(null)
  const insets = useSafeAreaInsets()
  const { palette, updateAppearance } = useAppAppearance()
  const { updateLocale } = useAppLocale()
  const bg = palette.bg
  const router = useRouter()
  const userId = useSession()?.user.id
  const isSignOutScreen = path === WEBVIEW_DEVICE_SIGN_OUT_PATH
  const activeUri = React.useRef<string | null>(null)

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
  const retriedRef = React.useRef(false)
  const attemptRef = React.useRef(0)
  const requestInFlight = React.useRef(false)
  const completeWebViewSignOut = React.useRef<((ok: boolean) => void) | null>(null)

  const trustedOrigin = new URL(WEB_BASE).origin

  const loadUrl = React.useCallback((url: string | null) => {
    activeUri.current = url
    setUri(url)
  }, [])

  const loadWebViewSignOut = React.useCallback(async () => {
    if (await isDeviceOffline()) return false

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => completeWebViewSignOut.current?.(false), WEBVIEW_SIGN_OUT_TIMEOUT_MS)
      completeWebViewSignOut.current = (ok) => {
        clearTimeout(timeout)
        completeWebViewSignOut.current = null
        loadUrl(null)
        resolve(ok)
      }
      loadUrl(webUrl(WEBVIEW_DEVICE_SIGN_OUT_PATH))
    })
  }, [loadUrl])

  React.useEffect(() => () => completeWebViewSignOut.current?.(false), [])

  const startWebView = React.useCallback(
    async (targetPath: string) => {
      if (requestInFlight.current) return
      requestInFlight.current = true
      loadUrl(null)
      setError(null)

      try {
        if (isSignOutScreen) {
          // サインアウト完了で userId が消えた後は、保留キーを作り直さない。
          if (!userId) return
          // 先に WebView を終了する。通信できなければ次のハンドオフ前まで WebView を開かない。
          await markWebViewSignOutPending()
          await unregisterPushTokenForSignOut(userId)
          await finishPendingWebViewSignOut(loadWebViewSignOut)
          await signOutFromDevice()
          if (await loadStoredSession()) setError('failed')
          return
        }

        if (await isDeviceOffline()) {
          setError('offline')
          return
        }

        if (!(await finishPendingWebViewSignOut(loadWebViewSignOut))) {
          setError('failed')
          return
        }

        const result = await requestWebViewHandoff()
        if (result.status === 'signed-out') {
          router.replace('/(auth)/login')
          return
        }
        if (result.status !== 'ready') {
          setError('failed')
          return
        }

        initialPathRef.current = targetPath
        loadedRef.current = false
        const url = new URL(mobileHandoffUrl(WEB_BASE, targetPath, result.tokenHash, result.workspaceId))
        url.searchParams.set('attempt', String(++attemptRef.current))
        if (userId) {
          const fragment = new URLSearchParams(url.hash.slice(1))
          fragment.set('uid', userId)
          url.hash = fragment.toString()
        }
        // ワンタイムトークンはフラグメントに残し、アクセスログに送信しない。
        loadUrl(url.toString())
      } catch {
        console.error('[AppWebView] WebView の認証処理に失敗しました')
        setError('failed')
      } finally {
        requestInFlight.current = false
      }
    },
    [isSignOutScreen, loadUrl, loadWebViewSignOut, router, userId],
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
      void startWebView(path)
    } else if (loadedRef.current && path !== initialPathRef.current) {
      // ハンドオフ済み・ロード完了後の path 切り替えは内部遷移で処理する
      navigateTo(path)
    }
    // ロード未完了中の path 変更は onLoadEnd 側で反映する
  }, [path, startWebView, navigateTo])

  function handleLoadEnd(event: { nativeEvent: { url: string } }) {
    const target = getTrustedUrl(event.nativeEvent.url)
    if (
      uri !== activeUri.current ||
      requestInFlight.current ||
      !target ||
      target.pathname.startsWith('/auth/')
    ) return
    retriedRef.current = false
    onLoadEnd?.()
    if (loadedRef.current) return
    loadedRef.current = true
    // ロード完了前に切り替えられていた場合は、最新の path へ追従する
    if (initialPathRef.current !== null && pathRef.current !== initialPathRef.current) {
      navigateTo(pathRef.current)
    }
  }

  function recoverWebViewSession() {
    if (requestInFlight.current || isSignOutScreen) return
    if (retriedRef.current) {
      setError('failed')
      return
    }
    retriedRef.current = true
    void startWebView(pathRef.current)
  }

  function handleMessage(event: WebViewMessageEvent) {
    if (uri !== activeUri.current) return
    const source = getTrustedUrl(event.nativeEvent.url)
    if (!source) return

    type BridgeMessage = {
      type?: string
      attempt?: unknown
      ok?: unknown
      theme?: unknown
      accentId?: unknown
      locale?: unknown
      title?: unknown
      subtitle?: unknown
      canGoBack?: unknown
      path?: unknown
    }
    let msg: BridgeMessage | null
    try {
      msg = JSON.parse(event.nativeEvent.data) as BridgeMessage | null
    } catch {
      return
    }
    const download = parseWebViewDownloadRequest(msg)
    if (download) {
      void saveWebViewDownload(download)
      return
    }
    if (msg?.type === 'HANDOFF_FAILED') {
      if (
        source.pathname === '/auth/mobile-handoff' &&
        (msg.attempt ?? source.searchParams.get('attempt')) === String(attemptRef.current)
      ) {
        recoverWebViewSession()
      }
      return
    }
    if (msg?.type === 'WEBVIEW_SIGN_OUT_RESULT' && source.pathname === WEBVIEW_DEVICE_SIGN_OUT_PATH) {
      completeWebViewSignOut.current?.(msg.ok === true)
      return
    }
    if (msg?.type === 'DEVICE_SIGN_OUT_REQUESTED' && source.pathname === '/settings') {
      router.navigate('/(app)/signout')
      return
    }
    if (msg?.type === 'account-deleted') {
      // WebView側でAuthユーザーを削除したら、独立して保持しているネイティブの
      // Supabaseセッションもローカルから消し、認証画面へ戻す。
      void supabase.auth
        .getSession()
        .then(({ data }) => data.session?.user.id ?? null)
        .catch(() => null)
        .then((userId) =>
          finishNativeAccountDeletion(
            userId,
            () => supabase.auth.signOut({ scope: 'local' }),
            () => router.replace(ACCOUNT_DELETED_LOGIN_ROUTE),
          ),
        )
      return
    }
    if (msg?.type === LINK_APPLE_IDENTITY_MESSAGE_TYPE) {
      // 設定 WebView からの Apple 連携。Web OAuth は WebView 外へ出るため、
      // ネイティブセッションへ ID token で linkIdentity する。
      void linkAppleIdentity(t)
        .catch(
          (): NativeOAuthIdentityLinkResult => ({
            ok: false,
            message: t('Could not link Apple. Please try again in a moment.'),
          }),
        )
        .then((result) => {
          webViewRef.current?.injectJavaScript(buildAppleIdentityLinkedScript(result))
        })
      return
    }
    if (msg?.type === LINK_GOOGLE_IDENTITY_MESSAGE_TYPE) {
      // 設定 WebView からの Google 連携。ネイティブの WebBrowser + PKCE で
      // 現在のネイティブセッションへ linkIdentity する。
      void linkGoogleIdentity(t)
        .catch(
          (): NativeOAuthIdentityLinkResult => ({
            ok: false,
            message: t('Could not link Google. Please try again in a moment.'),
          }),
        )
        .then((result) => {
          webViewRef.current?.injectJavaScript(buildGoogleIdentityLinkedScript(result))
        })
      return
    }
    if (msg?.type === 'open-chats') {
      // Next.js の <Link> による画面内遷移は onShouldStartLoadWithRequest を通らないため、Web が行き先のパスを送ってくる。
      // path を送らない古い Web では一覧を開く
      const target = typeof msg.path === 'string' ? chatLinkTarget(msg.path, WEB_BASE, __DEV__) : null
      openChatLink(target ?? { kind: 'list' })
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
    if (msg?.type === 'locale-changed' && isLocalePreference(msg.locale)) {
      updateLocale(msg.locale)
    }
  }

  // 原本など WebView では保存できないファイルを、ネイティブのセッションで取得して共有シートに渡す。
  // ワークスペースは WebView が開いているものを使う（アプリの選択と違うことがある）
  async function saveWebViewDownload(download: WebViewDownloadRequest) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(t('Your session has expired. Please sign in again.'))
      await shareCachedAttachment({
        fileUrl: `${WEB_BASE.replace(/\/$/, '')}${download.path}`,
        fileId: download.cacheKey,
        fileName: download.fileName,
        auth: { accessToken: session.access_token, workspaceId: download.workspaceId },
        dialogTitle: t('Save file'),
        t,
      })
    } catch (error) {
      console.error('[AppWebView] ファイルを保存できませんでした:', error)
      Alert.alert(
        t('Could not save the file'),
        error instanceof Error ? error.message : t('Please try again in a moment.'),
      )
    }
  }

  function getTrustedUrl(url: string): URL | null {
    try {
      const target = new URL(url)
      return target.origin === trustedOrigin ? target : null
    } catch {
      return null
    }
  }

  function handleNavigationStateChange(state: WebViewNavigation) {
    const target = getTrustedUrl(state.url)
    if (uri !== activeUri.current || !target) return
    if (target.pathname === '/auth/login' || target.pathname === '/auth/signup') {
      if (!state.loading) recoverWebViewSession()
      return
    }
    onWebPathChange?.(target.pathname)
  }

  // チャンネル・メッセージへのリンクは通知と同じ経路で開く（スレッドへ移ったメッセージの移動先も辿る）
  function openChatLink(target: ChatLinkTarget) {
    if (target.kind === 'list') {
      router.push('/(app)/chats')
      return
    }
    if (target.kind === 'invalid') {
      Alert.alert(t('This link cannot be opened.'))
      return
    }
    void followNotification(router, target, {
      t,
      onUnavailable: (message) => Alert.alert(message),
    })
  }

  // WebView 内のチャット導線は、Web ではなくネイティブのチャットタブへ委譲する。
  function handleShouldStartLoadWithRequest(request: ShouldStartLoadRequest) {
    const decision = decideWebViewNavigation({
      url: request.url,
      trustedOrigin,
      allowChatRoutes,
      isTopFrame: request.isTopFrame,
      isAndroid: Platform.OS === 'android',
      development: __DEV__,
    })
    if (decision === 'open-native-chat') {
      openChatLink(chatLinkTarget(request.url, trustedOrigin, __DEV__) ?? { kind: 'list' })
      return false
    }
    if (decision === 'open-external') {
      void Linking.openURL(request.url).catch((err) => {
        console.error('[AppWebView] 外部URLを開けませんでした:', err)
      })
      return false
    }
    return decision === 'allow'
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
        <Text style={[styles.errorText, { color: palette.text3 }]}>
          {isSignOutScreen
            ? t('Could not sign out. Please try again.')
            : error === 'offline'
              ? t('This page is not available offline. Connect to the internet and try again.')
              : t('Could not load this page')}
        </Text>
        <Pressable
          style={[styles.retryButton, { backgroundColor: palette.accent }]}
          onPress={() => {
            retriedRef.current = false
            void startWebView(pathRef.current)
          }}
        >
          <Text style={[styles.retryLabel, { color: palette.onAccent }]}>{t('Retry')}</Text>
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
        key={uri}
        ref={webViewRef}
        source={{ uri }}
        // WebView 既定の白い背景が、ページ遷移で次の画面が描かれるまでの間に見えてしまう。
        // テーマの背景色にして、ダークテーマで白くチラつかないようにする
        style={[styles.webview, { backgroundColor: bg }]}
        // originWhitelist 外のURLはreact-native-webviewがOSへ直接渡すため、
        // HTTP(S)はここで受け、上の信頼済みオリジン判定で許可・拒否する。
        originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        // iOS スワイプバック（ブラウザの進む/戻るジェスチャー）
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        keyboardDisplayRequiresUserAction={!allowProgrammaticFocus}
        injectedJavaScript="window.cairnDeviceSignOut = true; true;"
        onError={() => {
          if (uri !== activeUri.current) return
          if (completeWebViewSignOut.current) completeWebViewSignOut.current(false)
          else setError('failed')
        }}
        onHttpError={({ nativeEvent }) => {
          if (uri !== activeUri.current) return
          if (completeWebViewSignOut.current) completeWebViewSignOut.current(false)
          else if (nativeEvent.statusCode === 503) setError('failed')
        }}
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
