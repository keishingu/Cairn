// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cairn - ログイン' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="app"
      data-theme="light"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px 16px',
      }}
    >
      {children}
    </div>
  )
}
