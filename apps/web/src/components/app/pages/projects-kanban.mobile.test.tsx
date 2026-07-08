// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageKanban } from './projects-kanban'

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../kanban', () => ({
  KanbanBoard: () => <div>kanban-board</div>,
}))

vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({
    onCreated,
  }: {
    onClose: () => void
    onCreated: (project: ProjectDto) => void
  }) => (
    <div data-testid="create-project-sheet">
      <button
        type="button"
        onClick={() => onCreated({
          id: 'created-project',
          title: '新規予定',
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
        })}
      >
        作成完了
      </button>
    </div>
  ),
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => '予定',
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
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

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <PageKanban isMobile openPanel={vi.fn()} />
    </QueryClientProvider>,
  )
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

  it('管理者はモバイルのカンバン画面から新規予定を開ける', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '新規予定' }))

    expect(screen.getByTestId('create-project-sheet')).toBeInTheDocument()
  })

  it('管理者でない場合は新規予定の導線を表示しない', () => {
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'member',
      isOwner: false,
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })

    renderPage()

    expect(screen.queryByRole('button', { name: '新規予定' })).not.toBeInTheDocument()
  })
})
