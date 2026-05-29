// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { MobileNav } from '@/components/app/mobile/nav'
import { PageAI } from '@/components/app/pages/ai'
import { ProjectListView } from '@/components/app/pages/project-list'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import { MemberDetailPanel } from '@/components/app/detail-panel/member-panel'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
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
import { useProjectPanel } from '@/hooks/use-project-panel'

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
  if (page === 'ai') return <PageAI isMobile />
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

function MobileShellInner({ isWebView }: { isWebView: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const page = pageFromPathname(pathname)
  const initialMemberId = pathname.startsWith('/members/') ? pathname.split('/')[2] : undefined
  const [projectsView, setProjectsViewState] = React.useState<ProjectsView>(loadStoredView)
  const [selectedMember, setSelectedMember] = React.useState<WorkspaceMemberDto | null>(null)

  // sessionStorage で webview フラグを永続化し、クライアントサイドナビゲーション後も維持
  const [inWebView, setInWebView] = React.useState(false)
  React.useEffect(() => {
    if (isWebView) sessionStorage.setItem('cairn:webview', '1')
    setInWebView(isWebView || sessionStorage.getItem('cairn:webview') === '1')
  }, [isWebView])

  const { panelProject, openPanel } = useProjectPanel()

  const setProjectsView = React.useCallback((view: string) => {
    if (!isValidView(view)) return
    localStorage.setItem(MOBILE_STORAGE_KEY, view)
    setProjectsViewState(view)
  }, [])

  // プロジェクトパネルが閉じたらメンバーパネルも閉じる
  React.useEffect(() => {
    if (!panelProject) setSelectedMember(null)
  }, [panelProject])

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

  return (
    <AppShellContext.Provider value={{ openPanel, openNotif: () => {}, projectsView, setProjectsView }}>
      <div className="app-root" style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
        <NavigationProgress />
        {/* ProjectPanel・MemberDetailPanel は position:fixed でフルスクリーン表示 */}
        {panelProject && (
          <ProjectPanel
            project={panelProject}
            onClose={() => router.push('/projects', { scroll: false })}
            onMemberClick={handleMemberClick}
            isMobile
          />
        )}
        {/* MemberDetailPanel は ProjectPanel の上に重なる（DOM 順で後ろ = 前面） */}
        {selectedMember && (
          <MemberDetailPanel
            member={selectedMember}
            onProjectClick={handleMemberProjectClick}
            onClose={() => setSelectedMember(null)}
            isMobile
          />
        )}
        <div className="app" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <MobilePage page={page} projectsView={projectsView} initialMemberId={initialMemberId} />
          </div>
          {!inWebView && <MobileNav page={page} projectsView={projectsView} onNavigate={(path) => router.push(path)} onChangeView={setProjectsView} />}
        </div>
      </div>
    </AppShellContext.Provider>
  )
}

export function MobileShell({ isWebView = false }: { isWebView?: boolean }) {
  return <MobileShellInner isWebView={isWebView} />
}
