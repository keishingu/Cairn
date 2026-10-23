'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WORKSPACE_COOKIE } from '@/lib/workspace-cookie'

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

function isWorkspaceId(value: string | null): value is string {
  return (
    value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
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
    const rawRedirect = params.get('redirect') ?? '/chats'
    const redirect = isSafeRedirect(rawRedirect) ? rawRedirect : '/chats'
    const workspaceId = params.get('workspaceId')

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

    // ネイティブで選んだ workspace を WebView の独立セッションにも引き継ぐ。
    // UUID 以外は Cookie に書き込まず、サーバー側でも active membership を再検証する。
    if (isWorkspaceId(workspaceId)) {
      document.cookie = `${WORKSPACE_COOKIE}=${workspaceId}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    }

    // router.replace() は RSC フェッチを発生させ、ミドルウェアが Cookie を
    // 確認するタイミングでまだ Cookie が届いていない場合がある。
    // window.location.replace() でフルリロードすることで Cookie を確実に送信する。
    const goRedirect = () => window.location.replace(redirect)

    void (async () => {
      // 既にこの WebView にセッションがあれば再ハンドオフ不要。
      // タブ切り替えごとに verifyOtp して無駄なセッションを増やさないため。
      const {
        data: { session },
      } = await supabase.auth.getSession()
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
