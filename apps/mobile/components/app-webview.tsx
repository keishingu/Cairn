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
  const [uri, setUri] = React.useState<string | null>(null)

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const { access_token, refresh_token } = session
      const redirect = encodeURIComponent(`${path}?webview=1`)
      setUri(
        `${WEB_BASE}/auth/mobile-handoff?access_token=${access_token}&refresh_token=${refresh_token}&redirect=${redirect}`,
      )
    })
  }, [path])

  if (!uri) return null

  return (
    <WebView
      ref={webViewRef}
      source={{ uri }}
      style={styles.webview}
    />
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
})
