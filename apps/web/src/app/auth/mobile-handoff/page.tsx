'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

// Expo の AppWebView に失敗理由を伝える（Metro のログに出る）。
// WebView 外（通常ブラウザ）で開いた場合は何もしない
function reportToNative(message: string) {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'handoff-error', message }))
}

function MobileHandoffInner() {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const rawRedirect = params.get('redirect') ?? '/projects'
    const redirect = isSafeRedirect(rawRedirect) ? rawRedirect : '/projects'

    // トークンは URL フラグメント（#at=...&rt=...）で受け取る。
    // フラグメントはサーバーに送信されないためアクセスログに残らない。
    const hash = window.location.hash.slice(1)
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get('at')
    const refreshToken = hashParams.get('rt')

    if (!accessToken || !refreshToken) {
      const message = 'トークンが渡されていません（URL フラグメント at / rt が空）'
      reportToNative(message)
      setError(message)
      return
    }

    // フラグメントからトークンを消去（履歴・画面表示に残さない）
    history.replaceState(null, '', window.location.pathname + window.location.search)

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      // setSession は認証エラーを throw せず { error } で返すため、必ず確認する。
      // 確認せずに redirect へ進むと、Cookie 未設定のまま middleware が
      // /auth/login へ弾き、AppWebView がネイティブセッションまで破棄してしまう
      .then(({ error: sessionError }) => {
        if (sessionError) throw sessionError
        // router.replace() は RSC フェッチを発生させ、ミドルウェアが Cookie を
        // 確認するタイミングでまだ Cookie が届いていない場合がある。
        // window.location.replace() でフルリロードすることで Cookie を確実に送信する。
        window.location.replace(redirect)
      })
      .catch((e: unknown) => {
        // /auth/login へは飛ばさない。飛ばすと失敗理由が見えないままネイティブも
        // サインアウトされるため、エラーを画面とネイティブログに出して留まる
        const message = e instanceof Error ? e.message : String(e)
        reportToNative(`setSession 失敗: ${message}`)
        setError(message)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <p style={{ fontWeight: 700 }}>認証の引き継ぎに失敗しました</p>
        <p style={{ fontSize: 14, color: '#b91c1c', overflowWrap: 'break-word' }}>{error}</p>
      </div>
    )
  }
  return null
}

export default function MobileHandoffPage() {
  return (
    <Suspense>
      <MobileHandoffInner />
    </Suspense>
  )
}
