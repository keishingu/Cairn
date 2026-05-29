// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isSafeRedirect(path: string): boolean {
  // 相対パスのみ許可（// で始まるプロトコル相対URLは拒否）
  return path.startsWith('/') && !path.startsWith('//')
}

function MobileHandoffInner() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const rawRedirect = params.get('redirect') ?? '/projects'
    const redirect = isSafeRedirect(rawRedirect) ? rawRedirect : '/projects'

    // トークンはURLパラメータではなく injectedJavaScript 経由で sessionStorage に書き込まれる
    const accessToken = sessionStorage.getItem('__cairn_at')
    const refreshToken = sessionStorage.getItem('__cairn_rt')

    if (!accessToken || !refreshToken) {
      router.replace('/auth/login')
      return
    }

    sessionStorage.removeItem('__cairn_at')
    sessionStorage.removeItem('__cairn_rt')

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
