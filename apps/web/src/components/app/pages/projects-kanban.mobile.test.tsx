// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageKanban } from './projects-kanban'

const mockKanbanBoard = vi.fn<(props: Record<string, unknown>) => React.JSX.Element>(
  () => <div data-testid="kanban-board" />,
)

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../kanban', () => ({
  KanbanBoard: (props: unknown) => mockKanbanBoard(props),
}))

vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({
    onCreated,
  }: {
    onClose: () => void
    onCreated: (project: ProjectDto) => void
  }) => {
    const project: ProjectDto = {
      id: 'created-project',
      title: '新規プロジェクト',
      description: null,
      statusName: null,
      statusColor: null,
      startDate: null,
      endDate: null,
      memberCount: 0,
      memberNames: [],
      memberAvatarUrls: [],
      taskCount: 0,
      completedTaskCount: 0,
      isOwner: true,
      isMember: true,
      archived: false,
      coverPhotoIdx: 0,
      coverPhotoUrl: null,
      location: null,
      placeId: null,
    }

    return (
      <div data-testid="create-project-sheet">
        <button type="button" onClick={() => onCreated(project)}>作成完了</button>
      </div>
    )
  },
}))

const mockUseWorkspacePermissions = vi.fn(() => ({
  wsRole: 'owner',
  isOwner: true,
  isAdmin: true,
  isMember: true,
  isGuest: false,
}))

vi.mock('@/hooks/use-current-user', () => ({
  useWorkspacePermissions: () => mockUseWorkspacePermissions(),
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => 'プロジェクト',
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

const mockFetchWithAuth = vi.fn<(url: string) => Promise<Response>>()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (url: string) => mockFetchWithAuth(url),
}))

function renderPage(openPanel = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const view = render(
    <QueryClientProvider client={queryClient}>
      <PageKanban isMobile openPanel={openPanel} />
    </QueryClientProvider>,
  )

  return { openPanel, ...view }
}

describe('PageKanban (モバイル)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockKanbanBoard.mockClear()
    mockFetchWithAuth.mockReset()
    mockUseWorkspacePermissions.mockReset()
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'owner',
      isOwner: true,
      isAdmin: true,
      isMember: true,
      isGuest: false,
    })
    mockFetchWithAuth.mockImplementation(async (url: string) => {
      if (url === '/api/projects' || url === '/api/projects/statuses') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  it('管理者はモバイルのカンバン画面から新規作成できる', async () => {
    const user = userEvent.setup()
    const { openPanel } = renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: '新規プロジェクト' }))

    expect(await screen.findByTestId('create-project-sheet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '作成完了' }))

    expect(openPanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'created-project' }))
  })

  it('非管理者には新規作成ボタンを出さない', async () => {
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'member',
      isOwner: false,
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })

    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    expect(screen.queryByRole('button', { name: '新規プロジェクト' })).toBeNull()
  })

  it('モバイルでは保存済みフィルタを KanbanBoard に渡さない', async () => {
    window.localStorage.setItem('cairn:kanban_status_filter', JSON.stringify(['done']))
    window.localStorage.setItem('cairn:kanban_member_filter', JSON.stringify(['Alice']))

    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    expect(mockKanbanBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        isMobile: true,
        onCardClick: expect.any(Function),
      }),
    )
    expect(mockKanbanBoard).not.toHaveBeenCalledWith(
      expect.objectContaining({
        statusFilter: expect.anything(),
      }),
    )
    expect(mockKanbanBoard).not.toHaveBeenCalledWith(
      expect.objectContaining({
        projectFilter: expect.anything(),
      }),
    )
  })
})
