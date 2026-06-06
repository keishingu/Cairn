// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Icon } from '../primitives'
import { useAppShell } from '../app-shell-context'
import { useUnreadNotificationCount } from '@/lib/notifications/client'

interface MobileHeaderProps {
  title: string
  subtitle?: string | undefined
  onBack?: () => void
  right?: React.ReactNode
}

export function MobileHeader({ title, subtitle, onBack, right }: MobileHeaderProps) {
  const { openNotif } = useAppShell()
  const unreadCount = useUnreadNotificationCount()
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px', paddingTop: 'max(10px, env(safe-area-inset-top))',
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {onBack && (
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontFamily: 'inherit' }}>
          <Icon name="chevLeft" size={18}/>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: subtitle ? 15 : 17, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        {subtitle && <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>{subtitle}</p>}
      </div>
      <button
        onClick={openNotif}
        className="btn btn-ghost"
        style={{ width: 34, padding: 0, justifyContent: 'center', position: 'relative', flexShrink: 0 }}
      >
        <Icon name="bell" size={17}/>
        {unreadCount > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--card)' }}/>}
      </button>
      {right}
    </header>
  )
}
