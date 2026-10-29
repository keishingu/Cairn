// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MobileNav } from '@/components/app/mobile/nav'
import { PageAI } from '@/components/app/pages/ai'
import { ProjectListView } from '@/components/app/pages/project-list'
import { ProjectPanel } from '@/components/app/detail-panel/project-panel'
import { MemberDetailPanel } from '@/components/app/detail-panel/member-panel'
import type { MemberProjectDto } from '@/app/api/workspaces/members/[userId]/projects/route'
import { MobileSettings, MobileSettingsDetail } from '@/components/app/mobile/settings'
import { MobileHeader } from '@/components/app/mobile/header'
import { PageChat } from '@/components/app/pages/chat'
import { PageTasks } from '@/components/app/pages/tasks'
import { PageCalendar } from '@/components/app/pages/projects-calendar'
import { PageKanban } from '@/components/app/pages/projects-kanban'
import { Icon } from '@/components/app/primitives'
import { AppShellContext, useAppShell } from '@/components/app/app-shell-context'
import { NavigationProgress } from '@/components/navigation-progress'
import { PageNotifications } from '@/components/app/pages/notifications'
import { PageMembers } from '@/components/app/pages/members-page'
import { PageFiles } from '@/components/app/pages/files'
import { PageGallery } from '@/components/app/pages/gallery'
import { useDetailPanel } from '@/hooks/use-detail-panel'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { useT } from '@/components/locale-provider'

const MOBILE_STORAGE_KEY = STORAGE_KEYS.projects_view_mob
type ProjectsView = 'list' | 'calendar' | 'kanban'

function isValidView(v: string | null | undefined): v is ProjectsView {
  return v === 'list' || v === 'calendar' || v === 'kanban'
}

function loadStoredView(): ProjectsView {
  if (typeof window === 'undefined') return 'list'
  const saved = localStorage.getItem(MOBILE_STORAGE_KEY)
  return isValidView(saved) ? saved : 'list'
}

function loadWebViewMode(): boolean {
  if (typeof window === 'undefined') return false
  if (new URLSearchParams(window.location.search).get('webview') === '1') {
    sessionStorage.setItem(STORAGE_KEYS.webview_mode, '1')
    return true
  }
  return sessionStorage.getItem(STORAGE_KEYS.webview_mode) === '1'
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
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
  members: 'Members',
}

export function shouldRenderMobileNav(hideNav: boolean) {
  return !hideNav
}

/**
 * 各ページが下部ナビに隠れないよう下端に空ける余白。--mobile-nav-h はナビの高さ、
 * --mobile-nav-clearance はナビに少し間を足した高さ。アプリの WebView では Web のナビを描かず、
 * ネイティブのタブバーが下端の安全領域まで受け持つため 0 にする（残すと中身のない帯が見える）
 */
export function mobileNavSpaceStyle(navVisible: boolean): React.CSSProperties {
  return {
    '--mobile-nav-h': navVisible ? 'calc(65px + env(safe-area-inset-bottom))' : '0px',
    '--mobile-nav-clearance': navVisible ? 'calc(80px + env(safe-area-inset-bottom))' : '0px',
  } as React.CSSProperties
}

function MobilePlaceholder({ title }: { title: string }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title={title} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="gear" size={24} color="var(--text-4)" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>{t('Coming soon')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-4)' }}>{t('The mobile version of this page is not ready yet')}</div>
      </div>
    </div>
  )
}

// AppShellContext.Provider の内側でレンダリングされるため useAppShell() が使える
function MobilePage({ page, projectsView, initialMemberId, settingsSection }: { page: string; projectsView: ProjectsView; initialMemberId?: string | undefined; settingsSection?: string | undefined }) {
  const t = useT()
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
      <MobileHeader title={t('My tasks')} />
      <React.Suspense fallback={null}>
        <PageTasks isMobile />
      </React.Suspense>
    </div>
  )
  if (page === 'ai') return <PageAI isMobile />
  if (page === 'settings') return settingsSection ? <MobileSettingsDetail section={settingsSection} /> : <MobileSettings />
  if (page === 'members') return <PageMembers isMobile {...(initialMemberId ? { initialUserId: initialMemberId } : {})} />
  if (page === 'files') return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title={t('Files')} />
      <PageFiles isMobile />
    </div>
  )
  if (page === 'gallery') return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title={t('Gallery')} />
      <PageGallery isMobile />
    </div>
  )
  if (page in MENU_PAGE_LABELS) return <MobilePlaceholder title={t(MENU_PAGE_LABELS[page]!)} />
  return (
    <React.Suspense fallback={null}>
      <ProjectListView isMobile openPanel={openPanel} />
    </React.Suspense>
  )
}

function MobileShellInner({ hideNav, webView, overlay }: { hideNav: boolean; webView: boolean; overlay?: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const page = pageFromPathname(pathname)
  const initialMemberId = pathname.startsWith('/members/') ? pathname.split('/')[2] : undefined
  const settingsSection = pathname.startsWith('/settings/') ? pathname.split('/')[2] : undefined
  const [projectsView, setProjectsViewState] = React.useState<ProjectsView>(loadStoredView)
  const [isWebView] = React.useState(() => webView || loadWebViewMode())
  const [isNativeChatAux] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('nativeAux') === '1',
  )
  const [notifOpen, setNotifOpen] = React.useState(false)

  React.useEffect(() => {
    const handleProjectsViewChange = () => setProjectsViewState(loadStoredView())
    window.addEventListener('cairn:projects-view-changed', handleProjectsViewChange)
    return () => window.removeEventListener('cairn:projects-view-changed', handleProjectsViewChange)
  }, [])

  React.useEffect(() => {
    if (!isWebView || page !== 'chats' || isNativeChatAux) return
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'open-chats' }))
    router.back()
  }, [isNativeChatAux, isWebView, page, router])

  const { panelState, panelProject, panelMember, panelTab, setPanelTab, openPanel, openProjectById, openMember, backPanel } = useDetailPanel()

  const setProjectsView = React.useCallback((view: string) => {
    if (!isValidView(view)) return
    localStorage.setItem(MOBILE_STORAGE_KEY, view)
    setProjectsViewState(view)
  }, [])

  const handleMemberProjectClick = React.useCallback((p: MemberProjectDto) => {
    openProjectById(p.projectId)
  }, [openProjectById])

  return (
    <AppShellContext.Provider value={{ openPanel, openMember, openNotif: () => setNotifOpen(true), isWebView, projectsView, setProjectsView, crossSearchNonce: 0, consumeCrossSearch: () => {} }}>
      {/* .app の部品スタイル（.btn 等）は子孫セレクタで当たる。全画面パネルや .app-root への portal が
          外れないよう、ルート自体を .app にする（内側だけに付けるとモバイルのプロジェクト詳細でスタイルが外れる） */}
      <div className="app app-root" style={{ width: '100vw', height: '100dvh', overflow: 'hidden', position: 'relative', ...mobileNavSpaceStyle(shouldRenderMobileNav(hideNav)) }}>
        <NavigationProgress />
        {overlay}
        {notifOpen && <PageNotifications onClose={() => setNotifOpen(false)} isMobile/>}
        {/* パネルは position:fixed でフルスクリーン表示。ブラウザ履歴でスタック管理する */}
        {/* タブ状態も URL で管理し、プロジェクト切替・リロード後に同じタブを維持する */}
        {panelState?.type === 'project' && panelProject && (
          <ProjectPanel
            project={panelProject}
            onClose={backPanel}
            onMemberClick={openMember}
            isMobile
            tab={panelTab}
            onTabChange={setPanelTab}
          />
        )}
        {panelState?.type === 'member' && panelMember && (
          <MemberDetailPanel
            member={panelMember}
            onProjectClick={handleMemberProjectClick}
            onClose={backPanel}
            isMobile
          />
        )}
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <MobilePage page={page} projectsView={projectsView} initialMemberId={initialMemberId} settingsSection={settingsSection} />
          </div>
          {shouldRenderMobileNav(hideNav) && (
            <MobileNav page={page} projectsView={projectsView} onNavigate={(path) => router.push(path)} onChangeView={setProjectsView} />
          )}
        </div>
      </div>
    </AppShellContext.Provider>
  )
}

/** overlay は .app-root の中に出す全画面の要素（アプリのモーダルなど）。外に出すとテーマ変数と .app の部品スタイルが当たらない */
export function MobileShell({ hideNav = false, webView = false, overlay }: { hideNav?: boolean; webView?: boolean; overlay?: React.ReactNode }) {
  return <MobileShellInner hideNav={hideNav} webView={webView} overlay={overlay} />
}
