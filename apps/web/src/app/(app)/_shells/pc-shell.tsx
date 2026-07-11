// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar, type PageId } from '@/components/app/sidebar'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import { MemberDetailPanel } from '@/components/app/detail-panel/member-panel'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { PageNotifications } from '@/components/app/pages/notifications'
import { AppShellContext } from '@/components/app/app-shell-context'
import { NavigationProgress } from '@/components/navigation-progress'
import { useDetailPanel } from '@/hooks/use-detail-panel'
import { useCommandDispatcher } from '@/hooks/use-command-dispatcher'
import { CommandProvider, useCommands } from '@/lib/command-registry'
import { ShortcutHints } from '@/components/app/shortcut-hints'
import { CommandPalette } from '@/components/app/command-palette'
import { ShortcutHelp } from '@/components/app/shortcut-help'
import { STORAGE_KEYS } from '@/lib/storage-keys'

const PC_STORAGE_KEY = STORAGE_KEYS.projects_view_pc
const SIDEBAR_COLLAPSED_KEY = STORAGE_KEYS.sidebar_collapsed
type ProjectsView = 'list' | 'calendar' | 'kanban'

const desktopPanelSlotStyleBase: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 0,
  width: 'min(420px, 100%)',
  display: 'flex',
  justifyContent: 'flex-end',
  minHeight: 0,
  minWidth: 0,
  zIndex: 20,
}

function getDesktopPanelTopOffset(pathnameSection: string) {
  return pathnameSection === 'projects' || pathnameSection === 'members' ? 56 : 0
}

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

function loadStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'list'
  const saved = localStorage.getItem(PC_STORAGE_KEY)
  return isValidView(saved) ? saved : 'list'
}

function PCShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const { panelProject, panelMember, panelTab, setPanelTab, openPanel, openProjectById, openMember, closePanel } = useDetailPanel()

  const [notifOpen, setNotifOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [crossSearchNonce, setCrossSearchNonce] = React.useState(0)

  const handleMemberClick = React.useCallback((userId: string) => {
    openMember(userId)
  }, [openMember])

  const handleMemberProjectClick = React.useCallback((p: MemberProjectDto) => {
    openProjectById(p.projectId)
  }, [openProjectById])

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  const [projectsView, setProjectsViewState] = React.useState<ProjectsView>(loadStoredView)

  const setProjectsView = React.useCallback((view: string) => {
    if (!isValidView(view)) return
    localStorage.setItem(PC_STORAGE_KEY, view)
    setProjectsViewState(view)
  }, [])

  const page = React.useMemo<PageId>(() => {
    const base = pathname.split('/')[1] || 'projects'
    if (base === 'projects') {
      if (projectsView === 'calendar') return 'calendar'
      if (projectsView === 'kanban') return 'kanban'
      return 'projects'
    }
    return base as PageId
  }, [pathname, projectsView])

  const pathnameSection = pathname.split('/')[1] ?? ''
  const desktopPanelSlotStyle = React.useMemo<React.CSSProperties>(() => ({
    ...desktopPanelSlotStyleBase,
    top: getDesktopPanelTopOffset(pathnameSection),
  }), [pathnameSection])

  React.useEffect(() => {
    setNotifOpen(false)
  }, [pathnameSection])

  const navigate = React.useCallback((p: PageId) => {
    if (p === 'calendar') { setProjectsView('calendar'); router.push('/projects') }
    else if (p === 'kanban') { setProjectsView('kanban'); router.push('/projects') }
    else if (p === 'projects') { setProjectsView('list'); router.push('/projects') }
    else router.push(`/${p}`)
  }, [router, setProjectsView])

  // Esc=閉じる: 最前面のオーバーレイ（通知 → 詳細パネル）を1つ閉じる。
  // Modal（ConfirmDialog や各種作成モーダル）が前面にある時は介入しない。
  const closeTopOverlay = React.useCallback(() => {
    if (typeof document !== 'undefined' && document.querySelector('[data-cairn-modal]')) return false
    if (notifOpen) { setNotifOpen(false); return true }
    if (panelMember || panelProject) { closePanel(); return true }
    return false
  }, [notifOpen, panelMember, panelProject, closePanel])

  // シェルが担うコマンド（ナビ・パレット・ヘルプ・通知・サイドバー・横断検索）
  useCommands({
    'nav.projects': () => navigate('projects'),
    'nav.calendar': () => navigate('calendar'),
    'nav.kanban': () => navigate('kanban'),
    'nav.tasks': () => navigate('tasks'),
    'nav.chats': () => navigate('chats'),
    'nav.files': () => navigate('files'),
    'nav.gallery': () => navigate('gallery'),
    'nav.ai': () => navigate('ai'),
    'nav.members': () => navigate('members'),
    'nav.settings': () => navigate('settings'),
    'app.notifications': () => setNotifOpen(true),
    'app.toggleSidebar': toggleSidebar,
    'global.commandPalette': () => setPaletteOpen(true),
    'global.help': () => setHelpOpen(true),
    // 横断検索: chats へ遷移し、nonce を増やして chats 画面に検索を開かせる
    'global.crossSearch': () => { navigate('chats'); setCrossSearchNonce(n => n + 1) },
  })

  useCommandDispatcher({ page, onEscape: closeTopOverlay })

  return (
    <AppShellContext.Provider value={{
      openPanel,
      openMember,
      openNotif: () => setNotifOpen(true),
      projectsView,
      setProjectsView,
      crossSearchNonce,
      consumeCrossSearch: () => setCrossSearchNonce(0),
    }}>
      <div className="app-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <NavigationProgress />
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
          <Sidebar page={page} setPage={navigate} openPanel={openPanel} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar}/>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                {children}
              </div>
              {panelMember ? (
                <div data-testid="desktop-detail-panel-slot" style={desktopPanelSlotStyle}>
                  <MemberDetailPanel
                    member={panelMember}
                    onProjectClick={handleMemberProjectClick}
                    onClose={closePanel}
                  />
                </div>
              ) : panelProject ? (
                <div data-testid="desktop-detail-panel-slot" style={desktopPanelSlotStyle}>
                  <ProjectPanel
                    project={panelProject}
                    onClose={closePanel}
                    onMemberClick={handleMemberClick}
                    tab={panelTab}
                    onTabChange={setPanelTab}
                  />
                </div>
              ) : null}
              {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
            </div>
          </main>
        </div>
        <ShortcutHints page={page} />
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} page={page} />}
        {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      </div>
    </AppShellContext.Provider>
  )
}

export function PCShell({ children }: { children: React.ReactNode }) {
  return (
    <CommandProvider>
      <PCShellInner>{children}</PCShellInner>
    </CommandProvider>
  )
}
