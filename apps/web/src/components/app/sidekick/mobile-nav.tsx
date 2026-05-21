// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Icon } from '../primitives'

interface MobileNavProps {
  page: string
  onNavigate: (path: string) => void
}

const TABS = [
  { id: 'dashboard', path: '/dashboard', icon: 'home',   label: 'ホーム' },
  { id: 'projects',  path: '/projects',  icon: 'kanban', label: 'プロジェクト' },
  { id: 'chats',     path: '/chats',     icon: 'chat',   label: 'チャット' },
  { id: 'tasks',     path: '/tasks',     icon: 'check',  label: 'タスク' },
  { id: 'menu',      path: '/settings',  icon: 'list',   label: 'メニュー' },
] as const

export function MobileNav({ page, onNavigate }: MobileNavProps) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'var(--card)', borderTop: '1px solid var(--border)',
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(tab => {
        const active = page === tab.id
        return (
          <button key={tab.id} onClick={() => onNavigate(tab.path)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '10px 4px',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: active ? 'var(--accent)' : 'var(--text-3)',
            transition: 'color .15s',
          }}>
            <Icon name={tab.icon} size={22}/>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: 'inherit' }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
