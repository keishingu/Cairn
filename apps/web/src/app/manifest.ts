// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next'
import { cookies } from 'next/headers'
import { translate } from '@cairn/shared'
import { ACCENT_PRESETS, DEFAULT_ACCENT_ID } from '@/lib/accent-presets'
import { readRequestLocale } from '@/lib/i18n/request-locale'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookieStore = await cookies()
  const accentCookie = cookieStore.get('cairn-accent')?.value ?? DEFAULT_ACCENT_ID
  const themeCookie  = cookieStore.get('cairn-theme')?.value ?? 'dark'

  const accent = ACCENT_PRESETS.find(p => p.id === accentCookie) ? accentCookie : DEFAULT_ACCENT_ID
  const theme  = themeCookie === 'light' ? 'light' : 'dark'
  const preset = ACCENT_PRESETS.find(p => p.id === accent)!
  const { locale } = await readRequestLocale()

  return {
    name: 'Cairn',
    short_name: 'Cairn',
    description: translate(locale, 'Chat, projects, and calendar in one place.'),
    start_url: '/chats',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: preset.swatch,
    background_color: theme === 'light' ? '#F8FAFC' : '#0B0F14',
    icons: [
      {
        src: `/icon-${accent}-${theme}-192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `/icon-${accent}-${theme}-512.png`,
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: `/icon-${accent}-${theme}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
