import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageKanban } from './projects-kanban'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import type { ProjectDto } from '@/app/api/projects/route'

const STUB_PROJECT = {
  id: 'p1',
  title: '新規プロジェクト',
  description: null,
  statusName: null,
  statusColor: null,
  startDate: null,
  endDate: null,
  memberNames: [],
  memberAvatarUrls: [],
  memberCount: 0,
  taskCount: 0,
  completedTaskCount: 0,
  isMember: true,
  isOwner: true,
  archived: false,
  coverPhotoUrl: null,
  coverPhotoIdx: 0,
  location: null,
  placeId: null,
} satisfies ProjectDto

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/hooks/use-current-user')
vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => 'プロジェクト',
}))
vi.mock('@/lib/command-registry', () => ({
  useCommand: () => undefined,
}))
vi.mock('../kanban', () => ({
  KanbanBoard: () => <div>kanban-board</div>,
}))
vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('../primitives', () => ({
  Fab: ({ label, onClick }: { label: string; onClick: () => void }) => <button onClick={onClick}>{label}</button>,
  Icon: () => <span />,
}))
vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({ onCreated }: { onCreated: (project: ProjectDto) => void }) => (
    <button onClick={() => onCreated(STUB_PROJECT)}>sheet-create</button>
  ),
}))

const mockFetch = vi.mocked(fetchWithAuth)
const mockUseWorkspacePermissions = vi.mocked(useWorkspacePermissions)

function renderPage(openPanel = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PageKanban openPanel={openPanel} isMobile />
    </QueryClientProvider>,
  )
  return { openPanel }
}

describe('PageKanban mobile create entry', () => {
  beforeEach(() => {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/projects/statuses') return new Response(JSON.stringify([]), { status: 200 })
      if (url === '/api/projects') return new Response(JSON.stringify([]), { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    })
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'admin',
      isOwner: false,
      isAdmin: true,
      isMember: true,
      isGuest: false,
    })
  })

  it('モバイルのカンバン画面から新規プロジェクト作成を開始できる', async () => {
    const user = userEvent.setup()
    const { openPanel } = renderPage()

    await user.click(screen.getByRole('button', { name: '新規プロジェクト' }))
    await user.click(screen.getByRole('button', { name: 'sheet-create' }))

    expect(openPanel).toHaveBeenCalledWith(STUB_PROJECT)
  })
})
