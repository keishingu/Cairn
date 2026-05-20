// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MobileNav } from '@/components/app/detail-panel/mobile-nav'
import { MobileDashboard } from '@/components/app/detail-panel/pages/dashboard'
import { MobileProjects } from '@/components/app/detail-panel/pages/projects'
import { MobileChat } from '@/components/app/detail-panel/pages/chat'
import { MobileAI } from '@/components/app/detail-panel/pages/ai'
import { MobileSettings } from '@/components/app/detail-panel/pages/settings'
import { AppShellContext } from '@/components/app/app-shell-context'

function pageFromPathname(pathname: string): string {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/chats') || pathname.startsWith('/chat')) return 'chats'
  if (pathname.startsWith('/ai')) return 'ai'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'dashboard'
}

function MobilePage({ page }: { page: string }) {
  if (page === 'projects') return <MobileProjects />
  if (page === 'chats') return <MobileChat />
  if (page === 'ai') return <MobileAI />
  if (page === 'settings') return <MobileSettings />
  return <MobileDashboard />
}

export function MobileShell() {
  const pathname = usePathname()
  const router = useRouter()
  const page = pageFromPathname(pathname)

  return (
    <AppShellContext.Provider value={{ openPanel: () => {}, openNotif: () => {} }}>
      <div className="app-root" style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <MobilePage page={page} />
          </div>
          <MobileNav page={page} onNavigate={(path) => router.push(path)} />
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
