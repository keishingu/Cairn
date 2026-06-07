// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { PCShell } from './pc-shell'
import { useAppShell } from '@/components/app/app-shell-context'
import type { ProjectDto } from '@/app/api/projects/route'

// ─── next/navigation モック ────────────────────────────────────────

const mockPush = vi.fn()
let mockPathname = '/projects'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

// ─── 子コンポーネントモック ────────────────────────────────────────

vi.mock('@/components/app/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

vi.mock('@/components/app/detail-panel/project-panel', () => ({
  ProjectPanel: ({ project, onClose }: { project: ProjectDto; onClose: () => void }) => (
    <div data-testid="project-panel" data-project-id={project.id}>
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}))

vi.mock('@/components/app/detail-panel/member-panel', () => ({
  MemberDetailPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="member-panel">
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}))

vi.mock('@/components/app/pages/notifications', () => ({
  PageNotifications: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="notifications">
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}))

vi.mock('@/components/navigation-progress', () => ({
  NavigationProgress: () => null,
}))

// ─── テスト用フィクスチャ ──────────────────────────────────────────

const STUB_PROJECT: ProjectDto = {
  id: 'proj-abc',
  title: 'テストプロジェクト',
  description: null,
  statusName: '実施中',
  statusColor: '#8B5CF6',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  memberCount: 2,
  memberNames: ['田中', '山田'],
  memberAvatarUrls: [null, null],
  taskCount: 5,
  completedTaskCount: 2,
  isOwner: true,
  isMember: true,
  archived: false,
  coverPhotoIdx: 0,
  coverPhotoUrl: null,
  location: null,
  placeId: null,
}

// context 経由で openPanel を呼ぶ用ヘルパーコンポーネント
function OpenPanelTrigger({ project }: { project?: ProjectDto }) {
  const { openPanel } = useAppShell()
  return (
    <button data-testid="open-btn" onClick={() => openPanel(project)}>
      開く
    </button>
  )
}

function ClosePanelTrigger() {
  const { openPanel } = useAppShell()
  return (
    <button data-testid="close-btn" onClick={() => openPanel()}>
      閉じる
    </button>
  )
}

function makeQC(projects: ProjectDto[] = [STUB_PROJECT]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['projects'], projects)
  return qc
}

function renderShell(pathname: string, { projects }: { projects?: ProjectDto[] } = {}) {
  mockPathname = pathname
  return render(
    <QueryClientProvider client={makeQC(projects)}>
      <PCShell>
        <OpenPanelTrigger project={STUB_PROJECT} />
      </PCShell>
    </QueryClientProvider>,
  )
}

// ─── テスト ────────────────────────────────────────────────────────

describe('PCShell — URL からパネル表示の導出', () => {
  beforeEach(() => mockPush.mockClear())

  it('/projects では ProjectPanel を表示しない', () => {
    renderShell('/projects')
    expect(screen.queryByTestId('project-panel')).toBeNull()
  })

  it('/projects/{id} では対応するプロジェクトの ProjectPanel を表示する', () => {
    renderShell('/projects/proj-abc')
    const panel = screen.getByTestId('project-panel')
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveAttribute('data-project-id', 'proj-abc')
  })

  it('キャッシュに存在しない ID では ProjectPanel を表示しない', () => {
    renderShell('/projects/no-such-id')
    expect(screen.queryByTestId('project-panel')).toBeNull()
  })

  it('/members などプロジェクト以外のパスでは ProjectPanel を表示しない', () => {
    renderShell('/members')
    expect(screen.queryByTestId('project-panel')).toBeNull()
  })
})

describe('PCShell — openPanel の URL 更新', () => {
  beforeEach(() => mockPush.mockClear())

  it('openPanel(project) は /projects/{id} に router.push する', async () => {
    renderShell('/projects')
    await userEvent.click(screen.getByTestId('open-btn'))
    expect(mockPush).toHaveBeenCalledWith('/projects/proj-abc', { scroll: false })
  })

  it('openPanel() は /projects に router.push する', async () => {
    mockPathname = '/projects'
    render(
      <QueryClientProvider client={makeQC()}>
        <PCShell>
          <ClosePanelTrigger />
        </PCShell>
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByTestId('close-btn'))
    expect(mockPush).toHaveBeenCalledWith('/projects', { scroll: false })
  })
})

describe('PCShell — ProjectPanel の閉じるボタン', () => {
  beforeEach(() => mockPush.mockClear())

  it('パネルの閉じるボタンは /projects に router.push する', async () => {
    renderShell('/projects/proj-abc')
    await userEvent.click(screen.getByText('閉じる'))
    expect(mockPush).toHaveBeenCalledWith('/projects', { scroll: false })
  })
})
