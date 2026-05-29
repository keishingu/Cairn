'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

function MobileHandoffInner() {
  const router = useRouter()
  const params = useSearchParams()

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
      router.replace('/auth/login')
      return
    }

    // フラグメントからトークンを消去（履歴・画面表示に残さない）
    history.replaceState(null, '', window.location.pathname + window.location.search)

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => router.replace(redirect))
      .catch(() => router.replace('/auth/login'))
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
