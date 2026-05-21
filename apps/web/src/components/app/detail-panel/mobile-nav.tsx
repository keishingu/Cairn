// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
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

const PROJECTS_VIEWS = [
  { id: 'list',     label: '一覧',       icon: 'list',     path: '/projects' },
  { id: 'calendar', label: 'カレンダー', icon: 'calendar', path: '/calendar' },
  { id: 'kanban',   label: 'カンバン',   icon: 'kanban',   path: '/kanban' },
]

const MENU_ITEMS = [
  { label: 'ファイル',   icon: 'file',   path: '/files' },
  { label: 'ギャラリー', icon: 'image',  path: '/gallery' },
  { label: 'メンバー',   icon: 'users',  path: '/members' },
  { label: '設定',       icon: 'gear',   path: '/settings' },
]

const MENU_PAGES = new Set(['settings', 'files', 'gallery', 'members', 'ai'])

function currentProjectsView(pathname: string): string {
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/kanban')) return 'kanban'
  return 'list'
}

export function MobileNav({ page, onNavigate }: MobileNavProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [projectsPickerOpen, setProjectsPickerOpen] = React.useState(false)

  const closeAll = () => { setMenuOpen(false); setProjectsPickerOpen(false) }

  const handleTabClick = (tab: typeof TABS[number]) => {
    if (tab.id === 'menu') {
      setProjectsPickerOpen(false)
      setMenuOpen(o => !o)
    } else if (tab.id === 'projects') {
      setMenuOpen(false)
      if (page === 'projects') {
        setProjectsPickerOpen(o => !o)
      } else {
        setProjectsPickerOpen(false)
        onNavigate(tab.path)
      }
    } else {
      closeAll()
      onNavigate(tab.path)
    }
  }

  const isMenuActive = MENU_PAGES.has(page)
  const projectsView = currentProjectsView(pathname ?? '')

  // Index of projects tab for popup positioning
  const projectsTabIndex = 1
  const TAB_COUNT = TABS.length

  return (
    <>
      {/* Overlay backdrop for any open popup */}
      {(menuOpen || projectsPickerOpen) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={closeAll}
        />
      )}

      {/* Projects view picker — positioned above the projects tab */}
      {projectsPickerOpen && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(65px + env(safe-area-inset-bottom))',
          left: `calc(${(projectsTabIndex / TAB_COUNT) * 100}% - 8px)`,
          zIndex: 50,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          minWidth: 160,
        }}>
          {PROJECTS_VIEWS.map((v, i) => {
            const active = v.id === projectsView
            return (
              <button
                key={v.path}
                onClick={() => { closeAll(); onNavigate(v.path) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 16px', border: 'none',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  borderTop: i > 0 ? '1px solid var(--divider)' : 'none',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  color: active ? 'var(--accent-text)' : 'var(--text)',
                }}
              >
                <Icon name={v.icon} size={16} color={active ? 'var(--accent-text)' : 'var(--text-3)'} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 700 : 500 }}>{v.label}</span>
                {active && <Icon name="check" size={14} color="var(--accent-text)" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Menu popup — full width above nav */}
      {menuOpen && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(65px + env(safe-area-inset-bottom))',
          left: 12, right: 12,
          zIndex: 50,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}>
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.path}
              onClick={() => { closeAll(); onNavigate(item.path) }}
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
      )}

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(tab => {
          const active =
            tab.id === 'menu' ? (menuOpen || isMenuActive) :
            tab.id === 'projects' ? (projectsPickerOpen || page === 'projects') :
            page === tab.id
          const iconName = tab.id === 'projects'
            ? (projectsView === 'calendar' ? 'calendar' : 'kanban')
            : tab.icon
          return (
            <button key={tab.id} onClick={() => handleTabClick(tab)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '10px 4px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-3)',
              transition: 'color .15s',
            }}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon name={iconName} size={22} />
                {tab.id === 'projects' && (
                  <span style={{
                    position: 'absolute', right: -7, top: 0,
                    fontSize: 8, lineHeight: 1, letterSpacing: '-1px',
                    color: active ? 'var(--accent)' : 'var(--text-4)',
                    userSelect: 'none',
                  }}>▲▼</span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: 'inherit' }}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
