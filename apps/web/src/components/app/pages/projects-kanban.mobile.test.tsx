// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDto } from '@/app/api/projects/route'
import { PageKanban } from './projects-kanban'

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      {right}
    </div>
  ),
}))

vi.mock('../kanban', () => ({
  KanbanBoard: () => <div data-testid="kanban-board">kanban</div>,
}))

vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({
    onCreated,
  }: {
    onClose: () => void
    onCreated: (project: ProjectDto) => void
  }) => {
    const queryClient = useQueryClient()
    const project: ProjectDto = {
      id: 'created-project',
      title: '新規予定',
      description: null,
      statusName: 'Inbox',
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
        <button
          type="button"
          onClick={() => {
            queryClient.setQueryData<ProjectDto[]>(['projects'], old => [project, ...(old ?? [])])
            onCreated(project)
          }}
        >
          作成完了
        </button>
      </div>
    )
  },
}))

vi.mock('./create-project-modal', () => ({
  CreateProjectModal: ({
    onCreated,
  }: {
    onClose: () => void
    onCreated: (project: ProjectDto) => void
  }) => {
    const project: ProjectDto = {
      id: 'desktop-created-project',
      title: 'デスクトップ予定',
      description: null,
      statusName: 'Inbox',
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
      <div data-testid="create-project-modal">
        <button type="button" onClick={() => onCreated(project)}>
          デスクトップ作成完了
        </button>
      </div>
    )
  },
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => '予定',
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

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

const mockFetchWithAuth = vi.fn<(url: string) => Promise<Response>>()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (url: string) => mockFetchWithAuth(url),
}))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

describe('PageKanban (モバイル)', () => {
  beforeEach(() => {
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

  it('ヘッダーの新規ボタンから作成シートを開ける', async () => {
    const user = userEvent.setup()
    const openPanel = vi.fn()
    const queryClient = makeQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <PageKanban isMobile openPanel={openPanel} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects/statuses')
    })

    await user.click(screen.getByRole('button', { name: '新規予定' }))

    expect(await screen.findByTestId('create-project-sheet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '作成完了' }))

    expect(openPanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'created-project' }))
    expect(queryClient.getQueryData<ProjectDto[]>(['projects'])).toHaveLength(1)
  })

  it('管理者以外には新規ボタンを表示しない', async () => {
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'member',
      isOwner: false,
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <PageKanban isMobile openPanel={() => {}} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects/statuses')
    })

    expect(screen.queryByRole('button', { name: '新規予定' })).not.toBeInTheDocument()
  })
})

describe('PageKanban (デスクトップ)', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockReset()
    mockFetchWithAuth.mockImplementation(async (url: string) => {
      if (url === '/api/projects' || url === '/api/projects/statuses') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  it('モーダル作成後に projects キャッシュへ即時反映する', async () => {
    const user = userEvent.setup()
    const queryClient = makeQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <PageKanban openPanel={() => {}} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects/statuses')
    })

    await user.click(screen.getByRole('button', { name: '新規予定' }))
    expect(await screen.findByTestId('create-project-modal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'デスクトップ作成完了' }))

    expect(queryClient.getQueryData<ProjectDto[]>(['projects'])).toEqual([
      expect.objectContaining({ id: 'desktop-created-project' }),
    ])
  })
})
