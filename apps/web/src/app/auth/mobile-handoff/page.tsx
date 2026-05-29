// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MobileHandoffPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const redirect = params.get('redirect') ?? '/projects'

    if (!accessToken || !refreshToken) {
      router.replace('/auth/login')
      return
    }

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => router.replace(redirect))
      .catch(() => router.replace('/auth/login'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
