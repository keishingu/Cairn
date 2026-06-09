// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar, type PageId } from '@/components/app/sidebar'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import { MemberDetailPanel } from '@/components/app/detail-panel/member-panel'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { PageNotifications } from '@/components/app/pages/notifications'
import { AppShellContext } from '@/components/app/app-shell-context'
import { NavigationProgress } from '@/components/navigation-progress'
import { useProjectPanel } from '@/hooks/use-project-panel'
import { STORAGE_KEYS } from '@/lib/storage-keys'

const PC_STORAGE_KEY = STORAGE_KEYS.projects_view_pc
const SIDEBAR_COLLAPSED_KEY = STORAGE_KEYS.sidebar_collapsed
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
  const queryClient = useQueryClient()

  const { panelProject, openPanel } = useProjectPanel()

  const [selectedMember, setSelectedMember] = React.useState<WorkspaceMemberDto | null>(null)
  const [notifOpen, setNotifOpen] = React.useState(false)

  const handleMemberClick = React.useCallback((userId: string, displayName: string) => {
    const cached = queryClient.getQueryData<WorkspaceMemberDto[]>(['workspace-members'])
    const found = cached?.find(m => m.userId === userId)
    setSelectedMember(found ?? {
      userId,
      displayName,
      avatarUrl: null,
      role: 'member',
      joinedAt: new Date().toISOString().slice(0, 10),
    })
  }, [queryClient])

  const handleMemberProjectClick = React.useCallback((p: MemberProjectDto) => {
    setSelectedMember(null)
    router.push(`/projects/${p.projectId}`, { scroll: false })
  }, [router])

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
  React.useEffect(() => {
    setSelectedMember(null)
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
      openNotif: () => setNotifOpen(true),
      projectsView,
      setProjectsView,
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
              {selectedMember ? (
                <MemberDetailPanel
                  member={selectedMember}
                  onProjectClick={handleMemberProjectClick}
                  onClose={() => setSelectedMember(null)}
                />
              ) : panelProject ? (
                <ProjectPanel
                  project={panelProject}
                  onClose={() => router.push('/projects', { scroll: false })}
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
