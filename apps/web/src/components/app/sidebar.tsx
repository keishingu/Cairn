'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Icon } from './primitives'
import { Avatar } from './primitives'
import { createClient } from '@/lib/supabase/client'
import type { CurrentUserDto } from '@/app/api/me/route'

export type PageId =
  | 'dashboard' | 'projects' | 'calendar' | 'kanban'
  | 'tasks' | 'chats' | 'files' | 'gallery' | 'ai'
  | 'members' | 'settings'

interface SidebarItemProps {
  icon?: string
  label: string
  active?: boolean
  badge?: number
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
    {badge != null && badge > 0 && (
      <span style={{
        background: 'var(--accent)', color: 'var(--on-accent)',
        fontSize: 10.5, fontWeight: 700, padding: '1px 6px',
        borderRadius: 999, minWidth: 18, textAlign: 'center',
      }}>{badge}</span>
    )}
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

interface SidebarProps {
  page: PageId
  setPage: (p: PageId) => void
}

export const Sidebar = ({ page, setPage }: SidebarProps) => {
  const projectChildren: SidebarGroupItem[] = [
    { id: 'projects', icon: 'list',     label: '一覧' },
    { id: 'calendar', icon: 'calendar', label: 'カレンダー' },
    { id: 'kanban',   icon: 'kanban',   label: 'カンバン' },
  ]
  const pinnedProjects = [
    { name: '北アルプス縦走計画', dot: 'var(--blue)' },
    { name: '夏山合宿計画', dot: 'var(--emerald)' },
    { name: 'クライミング講習会', dot: 'var(--amber)' },
    { name: '雪山訓練', dot: 'var(--rose)' },
  ]
  return (
    <aside style={{
      width: 236, flexShrink: 0,
      background: 'var(--card)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #10B981, #0891B2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
          }}>
            <Icon name="mountain" size={18} strokeWidth={2.2}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>山岳部</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.2 }}>東京工科大学 · Pro</div>
          </div>
          <Icon name="chevDown" size={14} color="var(--text-3)"/>
        </div>
        <button style={{
          marginTop: 12, width: '100%', height: 32,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px', borderRadius: 7,
          background: 'var(--card-2)', border: '1px solid var(--border)',
          color: 'var(--text-3)', fontSize: 12.5, fontFamily: 'inherit',
          cursor: 'pointer',
        }}>
          <Icon name="search" size={14}/>
          <span style={{ flex: 1, textAlign: 'left' }}>検索</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <nav style={{ flex: 1, overflow: 'auto', padding: '12px 12px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '4px 10px 6px', textTransform: 'uppercase' }}>ワークスペース</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarItem icon="home" label="ダッシュボード" active={page === 'dashboard'} onClick={() => setPage('dashboard')}/>
          <SidebarGroup icon="folder" label="プロジェクト" page={page} setPage={setPage} items={projectChildren}/>
          <SidebarItem icon="check" label="マイタスク" badge={4} active={page === 'tasks'} onClick={() => setPage('tasks')}/>
          <SidebarItem icon="chat" label="チャット一覧" badge={12} active={page === 'chats'} onClick={() => setPage('chats')}/>
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

        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', padding: '18px 10px 8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>ピン留めプロジェクト</span>
          <Icon name="plus" size={12} color="var(--text-4)"/>
        </div>
        {pinnedProjects.map((p, i) => (
          <button key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 10px', borderRadius: 7, border: 'none', background: 'transparent',
            color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
            fontFamily: 'inherit',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card-2)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.dot, flexShrink: 0 }}/>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </button>
        ))}
      </nav>

      <SidebarUserFooter />
    </aside>
  )
}

function SidebarUserFooter() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const { data: me } = useQuery<CurrentUserDto>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/me').then(r => r.json()),
    staleTime: 60_000,
  })
  const displayName = me?.displayName ?? '…'

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

  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }} ref={menuRef}>
      <Avatar name={displayName} size={32}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 }}>オンライン</div>
      </div>
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}
      >
        <Icon name="more" size={16}/>
      </button>
      {menuOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', right: 12, left: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 6, zIndex: 100,
        }}>
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
      )}
    </div>
  )
}

interface TopBarProps {
  title: string
  subtitle?: string | null
  children?: React.ReactNode
  onBell?: () => void
}

export const TopBar = ({ title, subtitle, children, onBell }: TopBarProps) => (
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
    <button onClick={onBell} className="btn btn-ghost" style={{ width: 34, padding: 0, justifyContent: 'center', position: 'relative' }}>
      <Icon name="bell" size={16}/>
      <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--card)' }}/>
    </button>
    <button className="btn btn-ghost" style={{ width: 34, padding: 0, justifyContent: 'center' }}><Icon name="inbox" size={16}/></button>
  </header>
)
