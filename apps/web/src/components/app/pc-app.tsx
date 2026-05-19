'use client'

import React from 'react'
import { Sidebar, TopBar, PageId } from './sidebar'
import { Icon } from './primitives'
import { ProjectPanel } from './project-panel'
import { PageDashboard } from './pages/dashboard'
import { PageProjects } from './pages/projects'
import { PageCalendar } from './pages/calendar'
import { PageKanban } from './pages/kanban-page'
import { PageGallery } from './pages/gallery'
import { PageAI } from './pages/ai'
import { PageSettings } from './pages/settings'
import { PageChat } from './pages/chat'
import { PageNotifications } from './pages/notifications'

const PlaceholderPage = ({ name, icon }: { name: string; icon: string }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
    <div style={{ maxWidth: 360, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Icon name={icon} size={26}/>
      </div>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>{name}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
        このセクションはサイドバーから他のページへ移動できることを示すプレースホルダーです。実装時にはここに専用のビューが表示されます。
      </p>
    </div>
  </div>
)

interface PCAppProps {
  theme?: 'light' | 'dark'
}

export const PCApp = ({ theme = 'light' }: PCAppProps) => {
  const [page, setPage] = React.useState<PageId>('projects')
  const [panel, setPanel] = React.useState(false)
  const [notifOpen, setNotifOpen] = React.useState(false)

  const onSetPage = (p: PageId) => { setPage(p); setPanel(false); setNotifOpen(false) }
  const openPanel = () => setPanel(true)

  const pageTitle: Record<PageId, string> = {
    dashboard: 'ダッシュボード',
    projects:  'プロジェクト',
    calendar:  'カレンダー',
    kanban:    'カンバン',
    tasks:     'マイタスク',
    chats:     'チャット',
    files:     'ファイル',
    gallery:   'ギャラリー',
    ai:        'AIアシスタント',
    members:   'メンバー',
    settings:  '設定',
  }

  const noTopBar = ['ai', 'settings', 'gallery', 'chats'].includes(page)

  return (
    <div className="app" data-theme={theme} style={{
      width: '100%', height: '100%', display: 'flex',
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <Sidebar page={page} setPage={onSetPage}/>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
        {!noTopBar && (
          <TopBar
            title={pageTitle[page]}
            subtitle={
              page === 'dashboard' ? '2024 Q2' :
              page === 'projects'  ? '8 件 · 進行中 7' :
              page === 'kanban'    ? '8 件 / 5 ステージ'
              : null
            }
            onBell={() => setNotifOpen(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 32, width: 280 }}>
              <Icon name="search" size={14} color="var(--text-3)"/>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-4)' }}>プロジェクト・人・ファイルを検索</span>
              <span className="kbd">⌘K</span>
            </div>
          </TopBar>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            {page === 'dashboard' && <PageDashboard openPanel={openPanel}/>}
            {page === 'projects'  && <PageProjects  openPanel={openPanel}/>}
            {page === 'calendar'  && <PageCalendar  openPanel={openPanel}/>}
            {page === 'kanban'    && <PageKanban    openPanel={openPanel}/>}
            {page === 'gallery'   && <PageGallery/>}
            {page === 'ai'        && <PageAI/>}
            {page === 'settings'  && <PageSettings/>}
            {page === 'chats'     && <PageChat/>}
            {page === 'tasks'     && <PlaceholderPage name="マイタスク" icon="check"/>}
            {page === 'files'     && <PlaceholderPage name="ファイル"   icon="file"/>}
            {page === 'members'   && <PlaceholderPage name="メンバー"   icon="users"/>}
          </div>
          {panel && <ProjectPanel onClose={() => setPanel(false)}/>}
          {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
        </div>
      </main>
    </div>
  )
}
