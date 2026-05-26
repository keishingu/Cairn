// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sidebar, type PageId } from '@/components/app/sidebar'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import { MemberDetailPanel } from '@/components/app/detail-panel/member-panel'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { PageNotifications } from '@/components/app/pages/notifications'
import { AppShellContext } from '@/components/app/app-shell-context'
import { NavigationProgress } from '@/components/navigation-progress'

const PC_STORAGE_KEY = 'cairn:projects_view_pc'
type ProjectsView = 'list' | 'calendar' | 'kanban'

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

function loadStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'list'
  const saved = localStorage.getItem(PC_STORAGE_KEY)
  return isValidView(saved) ? saved : 'list'
}

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

function PCShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const [selectedMember, setSelectedMember] = React.useState<WorkspaceMemberDto | null>(null)
  const [notifOpen, setNotifOpen] = React.useState(false)

  // URL から open project ID を導出（/projects ページのみ有効）
  const onProjectsPage = pathname.startsWith('/projects')
  const openProjectId = onProjectsPage
    ? (searchParams.get('open') ?? pathname.match(/^\/projects\/([^/?#]+)/)?.[1] ?? null)
    : null

  // open project ID があるとき一覧をフェッチ（ProjectListView と同じキー → キャッシュ共有）
  const { data: projects = [] } = useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    enabled: !!openProjectId,
  })

  const panelProject: ProjectDto | null = openProjectId
    ? (projects.find(p => p.id === openProjectId) ?? null)
    : null

  const handleMemberClick = React.useCallback((userId: string, displayName: string) => {
    const cached = queryClient.getQueryData<WorkspaceMemberDto[]>(['workspace-members'])
    const found = cached?.find(m => m.userId === userId)
    setSelectedMember(found ?? {
      userId,
      displayName,
      role: 'member',
      joinedAt: new Date().toISOString().slice(0, 10),
    })
  }, [queryClient])

  const handleMemberProjectClick = React.useCallback((p: MemberProjectDto) => {
    setSelectedMember(null)
    router.push(`/projects?open=${p.projectId}`)
  }, [router])

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

  // openPanel: URL を更新するだけ。シェルが URL を見てパネルを描画する
  const openPanel = React.useCallback((project?: ProjectDto) => {
    if (project) {
      window.history.replaceState(null, '', `/projects?open=${project.id}`)
    } else {
      window.history.replaceState(null, '', '/projects')
    }
  }, [])

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
          <Sidebar page={page} setPage={navigate}/>
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
                  onClose={() => window.history.replaceState(null, '', '/projects')}
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

export function PCShell({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense>
      <PCShellInner>{children}</PCShellInner>
    </React.Suspense>
  )
}
