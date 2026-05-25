'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

// Syncs the next-themes selection to a cookie so app/manifest.ts can read it server-side.
export function ThemeCookieSync() {
  const { theme } = useTheme()

  useEffect(() => {
    if (theme) {
      document.cookie = `cairn-theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
    }
  }, [theme])

  return null
}
