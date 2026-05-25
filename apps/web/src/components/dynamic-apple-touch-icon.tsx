'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, DEFAULT_ACCENT_ID } from '@/lib/accent-presets'

// Updates <link rel="apple-touch-icon"> based on the user's resolved theme and accent color.
// iOS reads this link at "Add to Home Screen" time, so updating it client-side is sufficient.
export function DynamicAppleTouchIcon() {
  const { resolvedTheme } = useTheme()
  const { accentId } = useAccentColor()

  useEffect(() => {
    const accent = ACCENT_PRESETS.find(p => p.id === accentId) ? accentId : DEFAULT_ACCENT_ID
    const theme  = resolvedTheme === 'light' ? 'light' : 'dark'
    const href   = `/apple-touch-icon-${accent}-${theme}.png`

    let link = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'apple-touch-icon'
      document.head.appendChild(link)
    }
    link.href = href
  }, [accentId, resolvedTheme])

  return null
}
