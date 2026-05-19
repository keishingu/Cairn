// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar, type PageId } from '@/components/app/sidebar'
import { ProjectPanel } from '@/components/app/project-panel'
import { PageNotifications } from '@/components/app/pages/notifications'
import { AppShellContext } from '@/components/app/app-shell-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [panel, setPanel] = React.useState(false)
  const [notifOpen, setNotifOpen] = React.useState(false)

  const page = (pathname.slice(1) || 'projects') as PageId

  React.useEffect(() => {
    setPanel(false)
    setNotifOpen(false)
  }, [pathname])

  return (
    <AppShellContext.Provider value={{ openPanel: () => setPanel(true), openNotif: () => setNotifOpen(true) }}>
      <div className="app-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div className="app" data-theme="light" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
          <Sidebar page={page} setPage={(p) => router.push(`/${p}`)}/>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
                {children}
              </div>
              {panel && <ProjectPanel onClose={() => setPanel(false)}/>}
              {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)}/>}
            </div>
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
