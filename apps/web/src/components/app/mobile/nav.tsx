// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon, Avatar } from '../primitives'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import type { WorkspaceListItemDto } from '@/app/api/workspaces/list/route'

interface MobileNavProps {
  page: string
  projectsView: string
  onNavigate: (path: string) => void
  onChangeView: (view: string) => void
}

const BASE_TABS = [
  { id: 'projects',  path: '/projects',  icon: 'kanban',    label: null },
  { id: 'chats',     path: '/chats',     icon: 'chat',      label: 'チャット' },
  { id: 'tasks',     path: '/tasks',     icon: 'check',     label: 'タスク' },
  { id: 'ai',        path: '/ai',        icon: 'sparkles',  label: 'AI' },
  { id: 'menu',      path: null,         icon: 'list',      label: 'メニュー' },
] as const

const PROJECTS_VIEWS = [
  { id: 'list',     label: '一覧',       icon: 'list'    },
  { id: 'calendar', label: 'カレンダー', icon: 'calendar' },
  { id: 'kanban',   label: 'カンバン',   icon: 'kanban'  },
]

const MENU_ITEMS = [
  { label: 'ファイル',   icon: 'file',     path: '/files' },
  { label: 'ギャラリー', icon: 'image',    path: '/gallery' },
  { label: 'メンバー',   icon: 'users',    path: '/members' },
  { label: '設定',       icon: 'gear',     path: '/settings' },
]

const MENU_PAGES = new Set(['settings', 'files', 'gallery', 'members'])

export function MobileNav({ page, projectsView, onNavigate, onChangeView }: MobileNavProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [projectsPickerOpen, setProjectsPickerOpen] = React.useState(false)
  const [wsSwitcherOpen, setWsSwitcherOpen] = React.useState(false)
  const projectLabel = useProjectLabel()
  const TABS = BASE_TABS.map(t => ({ ...t, label: t.label ?? projectLabel }))

  const { data: me } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetchWithAuth('/api/me').then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: workspace } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: workspaceList = [] } = useQuery<WorkspaceListItemDto[]>({
    queryKey: ['workspace-list'],
    queryFn: () => fetchWithAuth('/api/workspaces/list').then(r => r.json()),
    staleTime: 60_000,
  })

  function switchWorkspace(id: string) {
    document.cookie = `cairn_workspace_id=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    setMenuOpen(false)
    window.location.href = '/projects'
  }

  const closeAll = () => { setMenuOpen(false); setProjectsPickerOpen(false); setWsSwitcherOpen(false) }

  const handleTabClick = (tab: typeof TABS[number]) => {
    if (tab.id === 'menu') {
      setProjectsPickerOpen(false)
      setMenuOpen(o => !o)
      if (menuOpen) setWsSwitcherOpen(false)
    } else if (tab.id === 'projects') {
      setMenuOpen(false)
      setWsSwitcherOpen(false)
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

  // Index of projects tab for popup positioning
  const projectsTabIndex = 0
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
                key={v.id}
                onClick={() => { closeAll(); onChangeView(v.id); onNavigate('/projects') }}
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
          {/* ワークスペース + ユーザー情報 */}
          <div style={{ padding: '16px 20px 14px' }}>
            {/* ワークスペーススイッチャー */}
            <button
              onClick={() => setWsSwitcherOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0, textAlign: 'left',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: workspace?.logoUrl ? 'var(--border)' : 'linear-gradient(135deg, #10B981, #0891B2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', overflow: 'hidden',
              }}>
                {workspace?.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={workspace.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : workspace?.name
                    ? <span style={{ fontSize: 15, fontWeight: 700 }}>{workspace.name.slice(0, 1)}</span>
                    : <Icon name="mountain" size={16} strokeWidth={2.2} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {workspace?.name ?? '…'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.4 }}>ワークスペース</div>
              </div>
              <span style={{ display: 'inline-flex', transition: 'transform .15s', transform: wsSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                <Icon name="chevDown" size={14} color="var(--text-3)" />
              </span>
            </button>

            {/* インラインワークスペース一覧 */}
            {wsSwitcherOpen && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
                {workspaceList.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '8px 0', border: 'none',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: 'linear-gradient(135deg, #10B981, #0891B2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700, overflow: 'hidden',
                    }}>
                      {ws.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={ws.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} />
                        : ws.name.slice(0, 1)
                      }
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: ws.id === workspace?.id ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </span>
                    {ws.id === workspace?.id && <Icon name="check" size={13} color="var(--accent)" />}
                  </button>
                ))}
              </div>
            )}

            {/* ユーザー情報 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)',
            }}>
              <Avatar name={me?.displayName ?? ''} url={me?.avatarUrl ?? null} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {me?.displayName ?? '…'}
                </div>
                {me?.email && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {me.email}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--divider)' }} />

          {/* メニュー項目 */}
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
                {tab.id === 'menu'
                  ? (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
                      outline: active ? '2px solid var(--accent)' : '2px solid transparent',
                      outlineOffset: 1,
                      transition: 'outline-color .15s',
                    }}>
                      <Avatar name={me?.displayName ?? ''} url={me?.avatarUrl ?? null} size={24} />
                    </div>
                  )
                  : <Icon name={iconName} size={22} />
                }
                {tab.id === 'projects' && (
                  <span style={{
                    position: 'absolute', right: -7, top: 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
                    fontSize: 6, lineHeight: 1,
                    color: active ? 'var(--accent)' : 'var(--text-4)',
                    userSelect: 'none',
                  }}>
                    <span>▲</span>
                    <span>▼</span>
                  </span>
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
