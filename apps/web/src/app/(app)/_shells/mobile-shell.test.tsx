// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import { describe, expect, it, test, vi } from 'vitest'
import React from 'react'
import { MobileShell, mobileNavSpaceStyle, shouldRenderMobileNav } from './mobile-shell'

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/hooks/use-detail-panel', () => ({
  useDetailPanel: () => ({
    panelState: { type: 'project', id: 'proj-abc' },
    panelProject: { id: 'proj-abc' },
    panelMember: null,
    panelTab: 'gallery',
    setPanelTab: vi.fn(),
    openPanel: vi.fn(),
    openProjectById: vi.fn(),
    openMember: vi.fn(),
    closePanel: vi.fn(),
    backPanel: vi.fn(),
  }),
}))

vi.mock('@/components/app/detail-panel/project-panel', () => ({
  ProjectPanel: () => <div data-testid="project-panel" />,
}))
vi.mock('@/components/app/detail-panel/member-panel', () => ({ MemberDetailPanel: () => null }))
vi.mock('@/components/app/pages/project-list', () => ({ ProjectListView: () => null }))
vi.mock('@/components/app/pages/ai', () => ({ PageAI: () => null }))
vi.mock('@/components/app/pages/chat', () => ({ PageChat: () => null }))
vi.mock('@/components/app/pages/tasks', () => ({ PageTasks: () => null }))
vi.mock('@/components/app/pages/projects-calendar', () => ({ PageCalendar: () => null }))
vi.mock('@/components/app/pages/projects-kanban', () => ({ PageKanban: () => null }))
vi.mock('@/components/app/pages/notifications', () => ({ PageNotifications: () => null }))
vi.mock('@/components/app/pages/members-page', () => ({ PageMembers: () => null }))
vi.mock('@/components/app/pages/files', () => ({ PageFiles: () => null }))
vi.mock('@/components/app/pages/gallery', () => ({ PageGallery: () => null }))
vi.mock('@/components/app/mobile/nav', () => ({ MobileNav: () => null }))
vi.mock('@/components/app/mobile/settings', () => ({ MobileSettings: () => null, MobileSettingsDetail: () => null }))
vi.mock('@/components/app/mobile/header', () => ({ MobileHeader: () => null }))
vi.mock('@/components/navigation-progress', () => ({ NavigationProgress: () => null }))

describe('MobileShell', () => {
  // 全画面パネルはページ領域の外に描画されるため、.app がルートに無いと .btn 等の部品スタイルが外れる
  test('プロジェクト詳細パネルを .app の内側に描画する', () => {
    render(<MobileShell />)
    expect(screen.getByTestId('project-panel').closest('.app')).not.toBeNull()
  })
})

describe('shouldRenderMobileNav', () => {
  it('WebView では MobileNav を隠す', () => {
    expect(shouldRenderMobileNav(true)).toBe(false)
  })

  it('通常のモバイルブラウザでは MobileNav を表示する', () => {
    expect(shouldRenderMobileNav(false)).toBe(true)
  })
})

describe('mobileNavSpaceStyle', () => {
  // アプリの WebView では Web のナビを描かないため、ナビ分の余白が残ると下端に中身のない帯が見える
  it('ナビを描かないときは各ページの下端余白を 0 にする', () => {
    expect(mobileNavSpaceStyle(false)).toEqual({ '--mobile-nav-h': '0px', '--mobile-nav-clearance': '0px' })
  })

  it('ナビを描くときはナビの高さと下端の安全領域ぶん空ける', () => {
    expect(mobileNavSpaceStyle(true)).toEqual({
      '--mobile-nav-h': 'calc(65px + env(safe-area-inset-bottom))',
      '--mobile-nav-clearance': 'calc(80px + env(safe-area-inset-bottom))',
    })
  })
})
