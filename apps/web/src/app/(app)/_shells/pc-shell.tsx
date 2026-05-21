// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar, type PageId } from '@/components/app/sidebar'
import { ProjectPanel } from '@/components/app/project-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import { PageNotifications } from '@/components/app/pages/notifications'
import { AppShellContext } from '@/components/app/app-shell-context'

export function PCShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedProject, setSelectedProject] = React.useState<ProjectDto | null>(null)
  const [notifOpen, setNotifOpen] = React.useState(false)

  const page = React.useMemo<PageId>(() => {
    const base = pathname.split('/')[1] || 'projects'
    if (base === 'projects') {
      const view = searchParams.get('view')
      if (view === 'calendar' || view === 'kanban') return view as PageId
    }
    return base as PageId
  }, [pathname, searchParams])

  React.useEffect(() => {
    setSelectedProject(null)
    setNotifOpen(false)
  }, [pathname])

  const navigate = React.useCallback((p: PageId) => {
    if (p === 'calendar') router.push('/projects?view=calendar')
    else if (p === 'kanban') router.push('/projects?view=kanban')
    else router.push(`/${p}`)
  }, [router])

  return (
    <React.Suspense fallback={null}>
      <AppShellContext.Provider value={{ openPanel: (project?: ProjectDto) => setSelectedProject(project ?? null), openNotif: () => setNotifOpen(true) }}>
        <div className="app-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <div className="app" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
            <Sidebar page={page} setPage={navigate}/>
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
              <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                  {children}
                </div>
                {selectedProject && <ProjectPanel project={selectedProject} onClose={() => setSelectedProject(null)}/>}
                {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
              </div>
            </main>
          </div>
        </div>
      </AppShellContext.Provider>
    </React.Suspense>
  )
}
