// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cairn - ワークスペースの設定' }

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app app-root" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {children}
    </div>
  )
}
