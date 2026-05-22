// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Icon } from '../primitives'

interface MobileHeaderProps {
  title: string
  onBack?: () => void
  right?: React.ReactNode
}

export function MobileHeader({ title, onBack, right }: MobileHeaderProps) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))',
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {onBack && (
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontFamily: 'inherit' }}>
          <Icon name="chevLeft" size={18}/>
        </button>
      )}
      <h1 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{title}</h1>
      {right}
    </header>
  )
}
