import React from 'react'
import { View, StyleSheet, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
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
  const [handoff, setHandoff] = React.useState<{ uri: string; script: string } | null>(null)
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const bg = colorScheme === 'dark' ? BG_DARK : BG_LIGHT

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

  if (!handoff) return <View style={[styles.fill, { backgroundColor: bg }]} />

  return (
    <View style={[styles.fill, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: handoff.uri }}
        injectedJavaScriptBeforeContentLoaded={handoff.script}
        style={styles.webview}
        // 自ドメイン以外へのナビゲーションをブロック
        originWhitelist={[WEB_BASE]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webview: { flex: 1 },
})
