'use client'

import React from 'react'
import { useLocale } from '@/components/locale-provider'
import { useCurrentUser } from '@/hooks/use-current-user'

// 別端末で変えた言語設定を、ログイン後の /api/me に合わせて描画へ反映する。
export function LocaleDbSync() {
  const { data: user } = useCurrentUser()
  const { preference, setPreference } = useLocale()
  const userLocale = user?.locale

  React.useEffect(() => {
    if (!userLocale || userLocale === preference) return
    setPreference(userLocale)
  }, [preference, setPreference, userLocale])

  return null
}
