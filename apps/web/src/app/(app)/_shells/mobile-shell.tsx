// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MobileNav } from '@/components/app/mobile/nav'
import { MobileAI } from '@/components/app/mobile/ai'
import { ProjectListView } from '@/components/app/pages/project-list'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import type { ProjectDto } from '@/app/api/projects/route'
import { MobileSettings } from '@/components/app/mobile/settings'
import { MobileHeader } from '@/components/app/mobile/header'
import { PageChat } from '@/components/app/pages/chat'
import { PageTasks } from '@/components/app/pages/tasks'
import { PageCalendar } from '@/components/app/pages/projects-calendar'
import { PageKanban } from '@/components/app/pages/projects-kanban'
import { Icon } from '@/components/app/primitives'
import { AppShellContext, useAppShell } from '@/components/app/app-shell-context'
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

// AppShellContext.Provider の内側でレンダリングされるため useAppShell() が使える
function MobilePage({ page, projectsView, initialMemberId }: { page: string; projectsView: ProjectsView; initialMemberId?: string | undefined }) {
  const { openPanel } = useAppShell()
  if (page === 'projects') {
    if (projectsView === 'calendar') return <PageCalendar openPanel={openPanel} isMobile />
    if (projectsView === 'kanban') return <PageKanban openPanel={openPanel} isMobile />
    return (
      <React.Suspense fallback={null}>
        <ProjectListView isMobile openPanel={openPanel} />
      </React.Suspense>
    )
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
  if (page === 'members') return <PageMembers isMobile {...(initialMemberId ? { initialUserId: initialMemberId } : {})} />
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
  return (
    <React.Suspense fallback={null}>
      <ProjectListView isMobile openPanel={openPanel} />
    </React.Suspense>
  )
}

async function fetchProjects(): Promise<ProjectDto[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectDto[]>
}

function MobileShellInner() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = pageFromPathname(pathname)
  const initialMemberId = pathname.startsWith('/members/') ? pathname.split('/')[2] : undefined
  const [projectsView, setProjectsViewState] = React.useState<ProjectsView>(loadStoredView)

  const setProjectsView = React.useCallback((view: string) => {
    if (!isValidView(view)) return
    localStorage.setItem(MOBILE_STORAGE_KEY, view)
    setProjectsViewState(view)
  }, [])

  // /projects ページのみで ?open= を読む
  const openProjectId = page === 'projects'
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

  // openPanel: URL を更新するだけ。シェルが URL を見てパネルを描画する
  const openPanel = React.useCallback((project?: ProjectDto) => {
    if (project) {
      window.history.replaceState(null, '', `/projects?open=${project.id}`)
    }
  }, [])

  return (
    <AppShellContext.Provider value={{ openPanel, openNotif: () => {}, projectsView, setProjectsView }}>
      <div className="app-root" style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
        <NavigationProgress />
        {/* ProjectPanel は position:fixed でフルスクリーン表示（/projects ページのみ） */}
        {panelProject && (
          <ProjectPanel
            project={panelProject}
            onClose={() => window.history.replaceState(null, '', '/projects')}
            isMobile
          />
        )}
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <MobilePage page={page} projectsView={projectsView} initialMemberId={initialMemberId} />
          </div>
          <MobileNav page={page} projectsView={projectsView} onNavigate={(path) => router.push(path)} onChangeView={setProjectsView} />
        </div>
      </div>
    </AppShellContext.Provider>
  )
}

export function MobileShell() {
  return (
    <React.Suspense>
      <MobileShellInner />
    </React.Suspense>
  )
}
