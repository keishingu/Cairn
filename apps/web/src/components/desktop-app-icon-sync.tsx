'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'

// Desktop(Electron) の Dock / タスクバーのアイコンを外観設定に合わせる。
// どのアイコンにするか（初期値なら環境別の既定など）は main 側の app-icon.js が決める。
export function DesktopAppIconSync() {
  const { theme, resolvedTheme } = useTheme()
  const { accentId } = useAccentColor()

  useEffect(() => {
    if (!theme || !resolvedTheme) return
    window.cairnDesktop?.setAppIcon?.({ theme, accentId, resolvedTheme })
  }, [theme, resolvedTheme, accentId])

  return null
}
