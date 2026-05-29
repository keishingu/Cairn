import React from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { supabase } from '../lib/supabase'

const WEB_BASE = process.env['EXPO_PUBLIC_API_BASE_URL']!

interface Props {
  path: string
}

export function AppWebView({ path }: Props) {
  const webViewRef = React.useRef<WebView>(null)
  const [handoff, setHandoff] = React.useState<{ uri: string; script: string } | null>(null)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const { access_token, refresh_token } = session
      const redirect = encodeURIComponent(`${path}?webview=1`)

      // トークンをURLに含めず sessionStorage 経由で渡す（サーバーログへの露出を防ぐ）
      const script = `
        (function() {
          try {
            sessionStorage.setItem('__cairn_at', ${JSON.stringify(access_token)});
            sessionStorage.setItem('__cairn_rt', ${JSON.stringify(refresh_token)});
          } catch(e) {}
        })();
        true;
      `
      setHandoff({
        uri: `${WEB_BASE}/auth/mobile-handoff?redirect=${redirect}`,
        script,
      })
    })
  }, [path])

  if (!handoff) return null

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: handoff.uri }}
      injectedJavaScriptBeforeContentLoaded={handoff.script}
      style={styles.webview}
      // 自ドメイン以外へのナビゲーションをブロック
      originWhitelist={[WEB_BASE]}
    />
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
})
