// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MobileNav } from '@/components/app/mobile/nav'
import { MobileAI } from '@/components/app/mobile/ai'
import { ProjectListView } from '@/components/app/pages/project-list'
import { MobileSettings } from '@/components/app/mobile/settings'
import { MobileHeader } from '@/components/app/mobile/header'
import { PageChat } from '@/components/app/pages/chat'
import { PageTasks } from '@/components/app/pages/tasks'
import { PageCalendar } from '@/components/app/pages/projects-calendar'
import { PageKanban } from '@/components/app/pages/projects-kanban'
import { Icon } from '@/components/app/primitives'
import { AppShellContext } from '@/components/app/app-shell-context'
import { NavigationProgress } from '@/components/navigation-progress'
import { PageMembers } from '@/components/app/pages/members-page'
import { PageFiles } from '@/components/app/pages/files'
import { PageGallery } from '@/components/app/pages/gallery'

const MOBILE_STORAGE_KEY = 'cairn:projects_view_mobile'
type ProjectsView = 'list' | 'calendar' | 'kanban'

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

function loadStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'list'
  const saved = localStorage.getItem(MOBILE_STORAGE_KEY)
  return isValidView(saved) ? saved : 'list'
}

function pageFromPathname(pathname: string): string {
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/chats') || pathname.startsWith('/chat')) return 'chats'
  if (pathname.startsWith('/tasks')) return 'tasks'
  if (pathname.startsWith('/ai')) return 'ai'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/files')) return 'files'
  if (pathname.startsWith('/gallery')) return 'gallery'
  if (pathname.startsWith('/members')) return 'members'
  return 'projects'
}

const MENU_PAGE_LABELS: Record<string, string> = {
  members: 'メンバー',
}

function MobilePlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title={title} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="gear" size={24} color="var(--text-4)" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>準備中</div>
        <div style={{ fontSize: 13, color: 'var(--text-4)' }}>このページはモバイル版を準備中です</div>
      </div>
    </div>
  )
}

function MobilePage({ page, projectsView }: { page: string; projectsView: ProjectsView }) {
  if (page === 'projects') {
    if (projectsView === 'calendar') return <PageCalendar openPanel={() => {}} isMobile />
    if (projectsView === 'kanban') return <PageKanban openPanel={() => {}} isMobile />
    return <ProjectListView isMobile />
  }
  if (page === 'chats') return <PageChat isMobile />
  if (page === 'tasks') return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="マイタスク" />
      <PageTasks isMobile />
    </div>
  )
  if (page === 'ai') return <MobileAI />
  if (page === 'settings') return <MobileSettings />
  if (page === 'members') return <PageMembers isMobile />
  if (page === 'files') return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="ファイル" />
      <PageFiles isMobile />
    </div>
  )
  if (page === 'gallery') return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="ギャラリー" />
      <PageGallery isMobile />
    </div>
  )
  if (page in MENU_PAGE_LABELS) return <MobilePlaceholder title={MENU_PAGE_LABELS[page]!} />
  return <ProjectListView isMobile />
}

export function MobileShell() {
  const pathname = usePathname()
  const router = useRouter()
  const page = pageFromPathname(pathname)
  const [projectsView, setProjectsViewState] = React.useState<ProjectsView>(loadStoredView)

  const setProjectsView = React.useCallback((view: string) => {
    if (!isValidView(view)) return
    localStorage.setItem(MOBILE_STORAGE_KEY, view)
    setProjectsViewState(view)
  }, [])

  return (
    <AppShellContext.Provider value={{ openPanel: () => {}, openNotif: () => {}, projectsView, setProjectsView }}>
      <div className="app-root" style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
        <NavigationProgress />
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <MobilePage page={page} projectsView={projectsView} />
          </div>
          <MobileNav page={page} projectsView={projectsView} onNavigate={(path) => router.push(path)} onChangeView={setProjectsView} />
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
