'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon, UnreadBadge } from './primitives'
import { Avatar } from './primitives'
import { useAppShell } from './app-shell-context'
import { useUnreadNotificationCount } from '@/lib/notifications/client'
import { createClient } from '@/lib/supabase/client'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { UserStatus } from '@/lib/user-status'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import type { WorkspaceListItemDto } from '@/app/api/workspaces/list/route'
import { useProjectLabel } from '@/lib/use-workspace-settings'
import { useProjectChannels, useWorkspaceChannels, useWorkspaceDms } from '@/lib/chat/client'
import { useCommand } from '@/lib/command-registry'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useAutoPresence } from '@/lib/use-auto-presence'
import { usePinnedProjects, useUnpinProject } from '@/lib/use-pinned-projects'
import type { ProjectDto } from '@/app/api/projects/route'

export type PageId =
  | 'projects' | 'calendar' | 'kanban'
  | 'tasks' | 'chats' | 'files' | 'gallery' | 'ai'
  | 'members' | 'settings'

interface SidebarItemProps {
  icon?: string
  label: string
  active?: boolean
  badge?: number | undefined
  onClick?: () => void
  indent?: boolean
}

const SidebarItem = ({ icon, label, active, badge, onClick, indent }: SidebarItemProps) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: indent ? '7px 10px 7px 30px' : '8px 10px', borderRadius: 8, border: 'none',
    background: active ? 'var(--card-hover)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontWeight: active ? 600 : 500, fontSize: indent ? 13 : 13.5,
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    transition: 'background .12s', position: 'relative',
  }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
  >
    {active && <span style={{ position: 'absolute', left: -12, top: 6, bottom: 6, width: 3, borderRadius: 2, background: 'var(--accent)' }}/>}
    {icon && <Icon name={icon} size={17}/>}
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && <UnreadBadge count={badge} />}
  </button>
)

interface SidebarGroupItem {
  id: PageId
  icon: string
  label: string
  badge?: number
}

interface SidebarGroupProps {
  icon: string
  label: string
  page: PageId
  setPage: (p: PageId) => void
  items: SidebarGroupItem[]
}

const SidebarGroup = ({ icon, label, page, setPage, items }: SidebarGroupProps) => {
  const isChildActive = items.some(it => it.id === page)
  const [open, setOpen] = React.useState(isChildActive)
  React.useEffect(() => { if (isChildActive) setOpen(true) }, [isChildActive])
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none',
        background: 'transparent',
        color: isChildActive ? 'var(--text)' : 'var(--text-2)',
        fontWeight: isChildActive ? 600 : 500, fontSize: 13.5,
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <Icon name={icon} size={17}/>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ display: 'inline-flex', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--text-4)' }}>
          <Icon name="chevRight" size={12}/>
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 6, paddingLeft: 8, borderLeft: '1px solid var(--divider)' }}>
          {items.map(it => (
            <SidebarItem key={it.id} icon={it.icon} label={it.label}
              {...(it.badge !== undefined ? { badge: it.badge } : {})}
              active={page === it.id} onClick={() => setPage(it.id)} indent/>
          ))}
        </div>
      )}
    </>
  )
}

interface PinnedProjectItemProps {
  name: string
  dot: string
  onClick: () => void
  onUnpin: () => void
}

const PinnedProjectItem = ({ name, dot, onClick, onUnpin }: PinnedProjectItemProps) => {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '6px 10px', borderRadius: 7, border: 'none',
          background: hovered ? 'var(--card-2)' : 'transparent',
          color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit', paddingRight: hovered ? 28 : 10,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
      </button>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onUnpin() }}
          title="ピン留めを解除"
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-4)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'}
        >
          <Icon name="close" size={11}/>
        </button>
      )}
    </div>
  )
}

interface SidebarProps {
  page: PageId
  setPage: (p: PageId) => void
  openPanel?: (project: ProjectDto) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export const Sidebar = ({ page, setPage, openPanel, collapsed = false, onToggleCollapse }: SidebarProps) => {
  const router = useRouter()
  const projectLabel = useProjectLabel()
  const { data: projectChannels = [] } = useProjectChannels()
  const { data: workspaceChannels = [] } = useWorkspaceChannels()
  const { data: dms = [] } = useWorkspaceDms()
  // アーカイブ済みプロジェクトは折りたたみで隠れているため、未読バッジ総数には含めない
  const totalChatUnread = React.useMemo(
    () => [...projectChannels.filter(c => !c.archived), ...workspaceChannels, ...dms].reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [projectChannels, workspaceChannels, dms],
  )
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
  const [switcherOpen, setSwitcherOpen] = React.useState(false)

  // ⌘⌥; : ワークスペース切替ポップオーバーをトグル
  useCommand('app.workspaceMenu', () => setSwitcherOpen(o => !o))

  function switchWorkspace(id: string) {
    document.cookie = `cairn_workspace_id=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    setSwitcherOpen(false)
    // サーバーキャッシュ・TanStack Query・ルーターキャッシュをすべて破棄
    window.location.href = '/projects'
  }
  const projectChildren: SidebarGroupItem[] = [
    { id: 'projects', icon: 'list',     label: '一覧' },
    { id: 'calendar', icon: 'calendar', label: 'カレンダー' },
    { id: 'kanban',   icon: 'kanban',   label: 'カンバン' },
  ]
  const { data: pinnedProjects = [] } = usePinnedProjects()
  const unpinProject = useUnpinProject()
  const { data: allProjects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchWithAuth('/api/projects').then(r => r.json()),
    staleTime: 30_000,
  })

  const logoEl = (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: workspace?.logoUrl ? 'var(--border)' : 'linear-gradient(135deg, #10B981, #0891B2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', overflow: 'hidden',
      boxShadow: workspace?.logoUrl ? 'none' : '0 4px 12px rgba(16,185,129,0.3)',
    }}>
      {workspace?.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={workspace.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : workspace?.name
          ? <span style={{ fontSize: 14, fontWeight: 700 }}>{workspace.name.slice(0, 1)}</span>
          : <Icon name="mountain" size={18} strokeWidth={2.2}/>
      }
    </div>
  )

  if (collapsed) {
    return (
      <aside style={{
        width: 56, flexShrink: 0,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .2s ease',
        position: 'relative',
      }}>
        {/* ロゴ */}
        <div style={{ padding: '14px 0', display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--divider)', position: 'relative' }}>
          <button
            onClick={() => setSwitcherOpen(o => !o)}
            title={workspace?.name ?? 'ワークスペース'}
            style={{
              border: 'none', background: switcherOpen ? 'var(--card-hover)' : 'transparent',
              cursor: 'pointer', padding: 4, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { if (!switcherOpen) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
            onMouseLeave={e => { if (!switcherOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {logoEl}
          </button>

          {switcherOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSwitcherOpen(false)}/>
              <div style={{
                position: 'absolute', top: '100%', left: 4, right: 4,
                zIndex: 100,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                padding: '6px',
                marginTop: 4,
                minWidth: 200,
              }}>
                {workspaceList.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: 'none',
                      background: ws.id === workspace?.id ? 'var(--card-hover)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ws.id === workspace?.id ? 'var(--card-hover)' : 'transparent' }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: 'linear-gradient(135deg, #10B981, #0891B2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      {ws.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={ws.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }}/>
                        : ws.name.slice(0, 1)
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ws.name}
                      </div>
                    </div>
                    {ws.id === workspace?.id && (
                      <Icon name="check" size={14} color="var(--accent)"/>
                    )}
                  </button>
                ))}
                <div style={{ margin: '4px 0', height: 1, background: 'var(--border)' }} />
                <button
                  onClick={() => { setSwitcherOpen(false); router.push('/workspace/new') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: 'none', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    color: 'var(--text-3)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    border: '1.5px dashed var(--border-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name="plus" size={14} color="var(--text-4)"/>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>新しいワークスペースを作成</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* アイコンナビ */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '10px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <CollapsedNavItem icon="list"     label={`${projectLabel}：一覧`}       active={page === 'projects'} onClick={() => setPage('projects')}/>
          <CollapsedNavItem icon="calendar" label={`${projectLabel}：カレンダー`} active={page === 'calendar'} onClick={() => setPage('calendar')}/>
          <CollapsedNavItem icon="kanban"   label={`${projectLabel}：カンバン`}   active={page === 'kanban'}   onClick={() => setPage('kanban')}/>
          <CollapsedNavItem icon="check"    label="マイタスク"     active={page === 'tasks'}   onClick={() => setPage('tasks')}/>
          <CollapsedNavItem icon="chat"     label="チャット一覧"   badge={totalChatUnread || undefined} active={page === 'chats'}   onClick={() => setPage('chats')}/>
          <div style={{ margin: '6px 0', height: 1, background: 'var(--divider)' }}/>
          <CollapsedNavItem icon="file"     label="ファイル"       active={page === 'files'}   onClick={() => setPage('files')}/>
          <CollapsedNavItem icon="image"    label="ギャラリー"     active={page === 'gallery'} onClick={() => setPage('gallery')}/>
          <CollapsedNavItem icon="sparkles" label="AIアシスタント" active={page === 'ai'}      onClick={() => setPage('ai')}/>
          <div style={{ margin: '6px 0', height: 1, background: 'var(--divider)' }}/>
          <CollapsedNavItem icon="users"    label="メンバー"       active={page === 'members'}  onClick={() => setPage('members')}/>
          <CollapsedNavItem icon="settings" label="設定"           active={page === 'settings'} onClick={() => setPage('settings')}/>
        </nav>
        <SidebarUserFooter collapsed={true} onToggle={onToggleCollapse}/>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 236, flexShrink: 0,
      background: 'var(--card)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      transition: 'width .2s ease',
      position: 'relative',
    }}>
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--divider)', position: 'relative' }}>
        <button
          onClick={() => setSwitcherOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '4px 6px', borderRadius: 8, border: 'none',
            background: switcherOpen ? 'var(--card-hover)' : 'transparent',
            cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => { if (!switcherOpen) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
          onMouseLeave={e => { if (!switcherOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {logoEl}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{workspace?.name ?? '…'}</div>
            {workspace?.description && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.2 }}>{workspace.description}</div>
            )}
          </div>
          <Icon name="chevDown" size={14} color="var(--text-3)"/>
        </button>

        {/* ワークスペーススイッチャードロップダウン */}
        {switcherOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onClick={() => setSwitcherOpen(false)}
            />
            <div style={{
              position: 'absolute', top: '100%', left: 12, right: 12,
              zIndex: 100,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              padding: '6px',
              marginTop: 4,
            }}>
              {workspaceList.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => switchWorkspace(ws.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: 'none',
                    background: ws.id === workspace?.id ? 'var(--card-hover)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ws.id === workspace?.id ? 'var(--card-hover)' : 'transparent' }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: 'linear-gradient(135deg, #10B981, #0891B2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                  }}>
                    {ws.logoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={ws.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }}/>
                      : ws.name.slice(0, 1)
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </div>
                  </div>
                  {ws.id === workspace?.id && (
                    <Icon name="check" size={14} color="var(--accent)"/>
                  )}
                </button>
              ))}
              <div style={{ margin: '4px 0', height: 1, background: 'var(--border)' }} />
              <button
                onClick={() => { setSwitcherOpen(false); router.push('/workspace/new') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 10px', borderRadius: 7,
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  color: 'var(--text-3)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  border: '1.5px dashed var(--border-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="plus" size={14} color="var(--text-4)"/>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>新しいワークスペースを作成</span>
              </button>
            </div>
          </>
        )}

      </div>

      <nav style={{ flex: 1, overflow: 'auto', padding: '12px 12px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '4px 10px 6px', textTransform: 'uppercase' }}>ワークスペース</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarGroup icon="folder" label={projectLabel} page={page} setPage={setPage} items={projectChildren}/>
          <SidebarItem icon="check" label="マイタスク" active={page === 'tasks'} onClick={() => setPage('tasks')}/>
          <SidebarItem icon="chat" label="チャット一覧" badge={totalChatUnread || undefined} active={page === 'chats'} onClick={() => setPage('chats')}/>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '14px 10px 6px', textTransform: 'uppercase' }}>ライブラリ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="file"     label="ファイル"       active={page === 'files'}   onClick={() => setPage('files')}/>
          <SidebarItem icon="image"    label="ギャラリー"     active={page === 'gallery'} onClick={() => setPage('gallery')}/>
          <SidebarItem icon="sparkles" label="AIアシスタント" active={page === 'ai'}      onClick={() => setPage('ai')}/>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '14px 10px 6px', textTransform: 'uppercase' }}>管理</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="users"    label="メンバー" active={page === 'members'}  onClick={() => setPage('members')}/>
          <SidebarItem icon="settings" label="設定"     active={page === 'settings'} onClick={() => setPage('settings')}/>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '18px 10px 8px', textTransform: 'uppercase' }}>
          ピン留め{projectLabel}
        </div>

        {pinnedProjects.map(p => (
          <PinnedProjectItem
            key={p.id}
            name={p.title}
            dot={p.dot}
            onClick={() => {
              const full = allProjects.find(pr => pr.id === p.projectId)
              if (openPanel && full) {
                openPanel(full)
              } else if (full) {
                setPage('projects')
                openPanel?.(full)
              }
            }}
            onUnpin={() => unpinProject.mutate(p.projectId)}
          />
        ))}
      </nav>

      <SidebarUserFooter collapsed={false} onToggle={onToggleCollapse}/>
    </aside>
  )
}

interface CollapsedNavItemProps {
  icon: string
  label: string
  active?: boolean
  badge?: number | undefined
  onClick?: () => void
}

const CollapsedNavItem = ({ icon, label, active, badge, onClick }: CollapsedNavItemProps) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
      background: active ? 'var(--card-hover)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-3)',
      cursor: 'pointer', position: 'relative',
    }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
  >
    <Icon name={icon} size={18}/>
    {badge != null && (
      <UnreadBadge count={badge} size="sm" style={{ position: 'absolute', top: 4, right: 8 }} />
    )}
  </button>
)

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online',  label: 'オンライン',   color: '#22C55E' },
  { value: 'away',    label: '退席中',       color: '#F59E0B' },
  { value: 'busy',    label: '取り込み中',   color: '#EF4444' },
  { value: 'offline', label: 'オフライン',   color: '#9CA3AF' },
]

const statusLabel = (status: UserStatus | undefined) =>
  STATUS_OPTIONS.find(s => s.value === status)?.label ?? STATUS_OPTIONS[0]!.label
const statusColor = (status: UserStatus | undefined) =>
  STATUS_OPTIONS.find(s => s.value === status)?.color ?? STATUS_OPTIONS[0]!.color

const StatusDot = ({ status, size = 10 }: { status: UserStatus | undefined; size?: number }) => (
  <span style={{
    position: 'absolute', right: -1, bottom: -1, width: size, height: size, borderRadius: '50%',
    background: statusColor(status), border: '2px solid var(--card)', boxSizing: 'content-box',
  }}/>
)

function SidebarUserFooter({ collapsed = false, onToggle }: { collapsed?: boolean | undefined; onToggle?: (() => void) | undefined }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // ⌘⌥0: ユーザーメニューをトグル
  useCommand('app.userMenu', () => setMenuOpen(o => !o))

  const { data: me } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetchWithAuth('/api/me').then(r => r.json()),
    staleTime: 60_000,
  })
  const displayName = me?.displayName ?? '…'

  const statusMutation = useMutation({
    mutationFn: async ({ status, keepalive }: { status: UserStatus; keepalive?: boolean }) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(keepalive !== undefined ? { keepalive } : {}),
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスの更新に失敗しました')
      }
      return status
    },
    onSuccess: (status) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status } : prev)
    },
  })

  useAutoPresence({
    status: me?.status,
    updateStatus: async (status, options) => {
      try {
        await statusMutation.mutateAsync({
          status,
          ...(options?.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
        })
        return true
      } catch {
        return false
      }
    },
  })

  const statusMessageMutation = useMutation({
    mutationFn: async (statusMessage: string | null) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusMessage }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスメッセージの更新に失敗しました')
      }
      return statusMessage
    },
    onSuccess: (statusMessage) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, statusMessage } : prev)
    },
  })

  const [statusMessageDraft, setStatusMessageDraft] = React.useState('')
  React.useEffect(() => {
    if (menuOpen) setStatusMessageDraft(me?.statusMessage ?? '')
  }, [menuOpen, me?.statusMessage])

  function commitStatusMessage() {
    const trimmed = statusMessageDraft.trim()
    if (trimmed === (me?.statusMessage ?? '')) return
    statusMessageMutation.mutate(trimmed || null)
  }

  React.useEffect(() => {
    if (!menuOpen) return
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const userMenu = menuOpen && (
    <div style={{
      position: 'absolute', bottom: '100%', left: collapsed ? -4 : 12, right: collapsed ? -4 : 12,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 6, zIndex: 100,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '4px 10px 6px', textTransform: 'uppercase' }}>
        ステータス
      </div>
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => statusMutation.mutate({ status: opt.value })}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--text)', fontSize: 13,
            fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: opt.color, flexShrink: 0 }}/>
          <span style={{ flex: 1 }}>{opt.label}</span>
          {(me?.status ?? 'online') === opt.value && <Icon name="check" size={14} color="var(--accent)"/>}
        </button>
      ))}
      <div style={{ margin: '4px 0', height: 1, background: 'var(--border)' }}/>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '4px 10px 6px', textTransform: 'uppercase' }}>
        ステータスメッセージ
      </div>
      <input
        value={statusMessageDraft}
        onChange={e => setStatusMessageDraft(e.target.value)}
        onBlur={commitStatusMessage}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitStatusMessage()
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
        placeholder="例: 7/10〜17休みます"
        maxLength={100}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 10px', margin: '0 0 6px',
          borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit',
        }}
      />
      <div style={{ margin: '4px 0', height: 1, background: 'var(--border)' }}/>
      <button
        onClick={handleLogout}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none',
          background: 'transparent', color: 'var(--red-text)', fontSize: 13,
          fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--red-soft)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <Icon name="logout" size={14}/>
        ログアウト
      </button>
    </div>
  )

  const avatarWithDot = (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <Avatar name={displayName} url={me?.avatarUrl ?? null} size={32}/>
      <StatusDot status={me?.status}/>
    </span>
  )

  const toggleBtn = (
    <button
      onClick={onToggle}
      title={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--text-4)', padding: '5px 6px', borderRadius: 7,
        display: 'flex', alignItems: 'center', flexShrink: 0,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}
    >
      <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={15}/>
    </button>
  )

  if (collapsed) {
    return (
      <div style={{ padding: '10px 0', borderTop: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          title={me?.statusMessage ? `${displayName}（${statusLabel(me?.status)} / ${me.statusMessage}）` : `${displayName}（${statusLabel(me?.status)}）`}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: '50%', flexShrink: 0 }}
        >
          {avatarWithDot}
        </button>
        {toggleBtn}
        {userMenu}
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}
      >
        {avatarWithDot}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {me?.statusMessage ? me.statusMessage : statusLabel(me?.status)}
          </div>
        </div>
      </button>
      {toggleBtn}
      {userMenu}
    </div>
  )
}

export function BellButton({ size = 16 }: { size?: number }) {
  const { openNotif } = useAppShell()
  const unreadCount = useUnreadNotificationCount()
  return (
    <button onClick={openNotif} className="btn btn-ghost" style={{ width: 34, padding: 0, justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
      <Icon name="bell" size={size}/>
      <UnreadBadge count={unreadCount} size="sm" style={{ position: 'absolute', top: 1, right: 1, border: '2px solid var(--card)' }} />
    </button>
  )
}

interface TopBarProps {
  title: string
  subtitle?: string | null
  children?: React.ReactNode
}

export function TopBar({ title, subtitle, children }: TopBarProps) {
  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--card)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>{title}</h1>
          {subtitle && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{subtitle}</span>}
        </div>
      </div>
      {children}
      <BellButton />
    </header>
  )
}
