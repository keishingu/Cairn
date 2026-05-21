// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
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
  { id: 'menu',      path: null,         icon: 'list',   label: 'メニュー' },
] as const

const MENU_ITEMS = [
  { label: 'ファイル',   icon: 'file',   path: '/files' },
  { label: 'ギャラリー', icon: 'image',  path: '/gallery' },
  { label: 'メンバー',   icon: 'users',  path: '/members' },
  { label: '設定',       icon: 'gear',   path: '/settings' },
]

const MENU_PAGES = new Set(['settings', 'files', 'gallery', 'members', 'ai'])

export function MobileNav({ page, onNavigate }: MobileNavProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)

  const handleTabClick = (tab: typeof TABS[number]) => {
    if (tab.id === 'menu') {
      setMenuOpen(o => !o)
    } else {
      setMenuOpen(false)
      onNavigate(tab.path)
    }
  }

  const handleMenuItemClick = (path: string) => {
    setMenuOpen(false)
    onNavigate(path)
  }

  const isMenuActive = MENU_PAGES.has(page)

  return (
    <>
      {menuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(65px + env(safe-area-inset-bottom))',
              left: 12, right: 12,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {MENU_ITEMS.map((item, i) => (
              <button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 20px', border: 'none', background: 'transparent',
                  borderTop: i > 0 ? '1px solid var(--divider)' : 'none',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  color: 'var(--text)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon name={item.icon} size={18} color="var(--text-2)" />
                </div>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{item.label}</span>
                <Icon name="chevRight" size={14} color="var(--text-4)" style={{ marginLeft: 'auto' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(tab => {
          const active = tab.id === 'menu' ? (menuOpen || isMenuActive) : page === tab.id
          return (
            <button key={tab.id} onClick={() => handleTabClick(tab)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '10px 4px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-3)',
              transition: 'color .15s',
            }}>
              <Icon name={tab.icon} size={22} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: 'inherit' }}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
