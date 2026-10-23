'use client'

import React from 'react'
import { useTheme } from 'next-themes'
import { useAccentColor } from '@/components/accent-color-provider'
import { useCurrentUser } from '@/hooks/use-current-user'

export function AppearanceDbSync() {
  const { data: user } = useCurrentUser()
  const { setTheme } = useTheme()
  const { setAccentId } = useAccentColor()

  const userTheme = user?.theme
  const userAccentId = user?.accentId

  React.useEffect(() => {
    if (!userTheme || !userAccentId) return
    setTheme(userTheme)
    setAccentId(userAccentId)
  }, [setAccentId, setTheme, userAccentId, userTheme])

  return null
}
