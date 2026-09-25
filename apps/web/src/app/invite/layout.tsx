// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next'
import { translate } from '@cairn/shared'
import { readRequestLocale } from '@/lib/i18n/request-locale'

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await readRequestLocale()
  return { title: translate(locale, 'Cairn - Invite') }
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app app-root" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {children}
    </div>
  )
}
