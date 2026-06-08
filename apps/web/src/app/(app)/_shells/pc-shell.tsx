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
import { STORAGE_KEYS } from '@/lib/storage-keys'

const PC_STORAGE_KEY = STORAGE_KEYS.projects_view_pc
type ProjectsView = 'list' | 'calendar' | 'kanban'

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

function loadStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'list'
  const saved = localStorage.getItem(PC_STORAGE_KEY)
  return isValidView(saved) ? saved : 'list'
}

export function PCShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const { panelProject, panelMember, openPanel, openProjectById, openMember, closePanel } = useDetailPanel()

  const [notifOpen, setNotifOpen] = React.useState(false)

  const handleMemberClick = React.useCallback((userId: string) => {
    openMember(userId)
  }, [openMember])

  const handleMemberProjectClick = React.useCallback((p: MemberProjectDto) => {
    openProjectById(p.projectId)
  }, [openProjectById])

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
  React.useEffect(() => {
    setNotifOpen(false)
  }, [pathnameSection])

  const navigate = React.useCallback((p: PageId) => {
    if (p === 'calendar') { setProjectsView('calendar'); router.push('/projects') }
    else if (p === 'kanban') { setProjectsView('kanban'); router.push('/projects') }
    else if (p === 'projects') { setProjectsView('list'); router.push('/projects') }
    else router.push(`/${p}`)
  }, [router, setProjectsView])

  return (
    <AppShellContext.Provider value={{
      openPanel,
      openMember,
      openNotif: () => setNotifOpen(true),
      projectsView,
      setProjectsView,
    }}>
      <div className="app-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <NavigationProgress />
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
          <Sidebar page={page} setPage={navigate} openPanel={openPanel}/>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                {children}
              </div>
              {panelMember ? (
                <MemberDetailPanel
                  member={panelMember}
                  onProjectClick={handleMemberProjectClick}
                  onClose={closePanel}
                />
              ) : panelProject ? (
                <ProjectPanel
                  project={panelProject}
                  onClose={closePanel}
                  onMemberClick={handleMemberClick}
                />
              ) : null}
              {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
            </div>
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
