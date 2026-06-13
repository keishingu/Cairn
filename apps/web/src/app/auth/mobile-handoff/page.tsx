'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

// ネイティブ側（react-native-webview）へメッセージを返すためのブリッジ。
// WebView 外（通常ブラウザ）では存在しないため optional に扱う。
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

// ハンドオフ失敗時の処理。WebView 内ではネイティブに復帰（トークン更新＋再ハンドオフ
// またはログアウト）を委ね、/auth/login へは遷移しない。WebView 外（通常ブラウザ）の
// フォールバックとしてのみログインへ送る。
function handleFailure() {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HANDOFF_FAILED' }))
    return
  }
  window.location.replace('/auth/login')
}

function MobileHandoffInner() {
  const params = useSearchParams()

  useEffect(() => {
    const rawRedirect = params.get('redirect') ?? '/projects'
    const redirect = isSafeRedirect(rawRedirect) ? rawRedirect : '/projects'

    // ワンタイムトークン（magiclink の hashed_token）は URL フラグメント（#th=...）で受け取る。
    // フラグメントはサーバーに送信されないためアクセスログに残らない。
    // refresh_token をネイティブと共有すると rotation と衝突するため、
    // WebView 側は verifyOtp で独立したセッションを確立する
    // （docs/mobile-webview-auth-handoff.md）。
    const hash = window.location.hash.slice(1)
    const hashParams = new URLSearchParams(hash)
    const tokenHash = hashParams.get('th')

    // フラグメントからトークンを消去（履歴・画面表示に残さない）
    history.replaceState(null, '', window.location.pathname + window.location.search)

    const supabase = createClient()

    // router.replace() は RSC フェッチを発生させ、ミドルウェアが Cookie を
    // 確認するタイミングでまだ Cookie が届いていない場合がある。
    // window.location.replace() でフルリロードすることで Cookie を確実に送信する。
    const goRedirect = () => window.location.replace(redirect)

    void (async () => {
      // 既にこの WebView にセッションがあれば再ハンドオフ不要。
      // タブ切り替えごとに verifyOtp して無駄なセッションを増やさないため。
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        goRedirect()
        return
      }

      if (!tokenHash) {
        handleFailure()
        return
      }

      const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
      if (error) {
        handleFailure()
        return
      }

      goRedirect()
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function MobileHandoffPage() {
  return (
    <Suspense>
      <MobileHandoffInner />
    </Suspense>
  )
}
