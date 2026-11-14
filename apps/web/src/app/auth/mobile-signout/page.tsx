'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/components/locale-provider'
import { signOutCurrentSession } from '@/lib/supabase/sign-out'

export default function MobileSignOutPage() {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  const signOut = useCallback(async () => {
    setFailed(false)
    const bridge = window.ReactNativeWebView
    if (!bridge) {
      window.location.replace('/auth/login')
      return
    }

    const ok = await signOutCurrentSession()
    if (window.location.pathname === '/auth/mobile-device-signout') {
      bridge.postMessage(JSON.stringify({ type: 'WEBVIEW_SIGN_OUT_RESULT', ok }))
      return
    }

    // 旧アプリは明示ログアウト後の遷移を監視している。
    if (ok) window.location.replace('/auth/login')
    else setFailed(true)
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void signOut()
  }, [signOut])

  if (!failed) return null
  return (
    <div role="alert">
      <p>{t('Could not sign out. Please try again.')}</p>
      <button type="button" onClick={() => void signOut()}>{t('Retry')}</button>
    </div>
  )
}
