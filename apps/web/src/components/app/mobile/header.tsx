// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { useAppShell } from '../app-shell-context'
import { useUnreadNotificationCount } from '@/lib/notifications/client'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import type { WorkspaceListItemDto } from '@/app/api/workspaces/list/route'

interface MobileHeaderProps {
  title: string
  subtitle?: string | undefined
  onBack?: () => void
  right?: React.ReactNode
}

export function MobileHeader({ title, subtitle, onBack, right }: MobileHeaderProps) {
  const { openNotif } = useAppShell()
  const unreadCount = useUnreadNotificationCount()
  const [wsSwitcherOpen, setWsSwitcherOpen] = React.useState(false)

  const { data: workspace } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: workspaceList = [] } = useQuery<WorkspaceListItemDto[]>({
    queryKey: ['workspace-list'],
    queryFn: () => fetchWithAuth('/api/workspaces/list').then(r => r.json()),
    staleTime: 60_000,
    enabled: wsSwitcherOpen,
  })

  function switchWorkspace(id: string) {
    document.cookie = `cairn_workspace_id=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    setWsSwitcherOpen(false)
    window.location.href = '/projects'
  }

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px', paddingTop: 'max(10px, env(safe-area-inset-top))',
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {/* バックボタンがない最上位ページではワークスペースロゴを表示 */}
      {!onBack ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setWsSwitcherOpen(o => !o)}
            style={{
              width: 30, height: 30, border: 'none', cursor: 'pointer', padding: 0,
              borderRadius: 8,
              background: workspace?.logoUrl ? 'var(--border)' : 'linear-gradient(135deg, #10B981, #0891B2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', overflow: 'hidden', flexShrink: 0,
              outline: wsSwitcherOpen ? '2px solid var(--accent)' : '2px solid transparent',
              outlineOffset: 1,
              transition: 'outline-color .15s',
            }}
          >
            {workspace?.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={workspace.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : workspace?.name
                ? <span style={{ fontSize: 12, fontWeight: 700 }}>{workspace.name.slice(0, 1)}</span>
                : <Icon name="mountain" size={13} strokeWidth={2.2} />
            }
          </button>

          {wsSwitcherOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 29 }}
                onClick={() => setWsSwitcherOpen(false)}
              />
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                zIndex: 30,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: 'var(--shadow-pop)',
                padding: 6,
                minWidth: 210,
              }}>
                {workspaceList.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '9px 10px', borderRadius: 7,
                      border: 'none',
                      background: ws.id === workspace?.id ? 'var(--card-hover)' : 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      background: 'linear-gradient(135deg, #10B981, #0891B2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 11, fontWeight: 700, overflow: 'hidden',
                    }}>
                      {ws.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={ws.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} />
                        : ws.name.slice(0, 1)
                      }
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </span>
                    {ws.id === workspace?.id && <Icon name="check" size={13} color="var(--accent)" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
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
        {unreadCount > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--card)' }}/>}
      </button>
      {right}
    </header>
  )
}
