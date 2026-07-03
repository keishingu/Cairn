import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectListView } from './project-list'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useWorkspacePermissions } from '@/hooks/use-current-user'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import type { ProjectDto } from '@/app/api/projects/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'

let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/hooks/use-current-user')
vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => 'プロジェクト',
}))
vi.mock('@/lib/command-registry', () => ({
  useCommand: () => undefined,
}))
vi.mock('@/hooks/use-list-selection', () => ({
  useListSelection: () => ({ selectedIndex: -1, setSelectedIndex: vi.fn() }),
}))
vi.mock('./create-project-modal', () => ({
  CreateProjectModal: () => <div>create-project-modal</div>,
}))
vi.mock('./filter-popover', () => ({
  FilterPopover: () => <div>filter-popover</div>,
}))
vi.mock('./page-toolbar', () => ({
  PageToolbar: ({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) => (
    <div>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  ),
  SegmentedControl: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <button onClick={() => onChange(value)}>{value}</button>
  ),
}))
vi.mock('../primitives', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
  AvatarStack: () => <div>avatar-stack</div>,
  StatusChip: ({ name }: { name: string }) => <span>{name || 'status-chip'}</span>,
  MountainPhoto: () => <div>mountain-photo</div>,
  Fab: () => null,
  ArchivedBadge: () => <span>archived</span>,
  ARCHIVED_OPACITY: 0.55,
}))
vi.mock('../mobile/header', () => ({
  MobileHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

const mockFetch = vi.mocked(fetchWithAuth)
const mockUseWorkspacePermissions = vi.mocked(useWorkspacePermissions)

const STUB_PROJECT = {
  id: 'proj-1',
  title: 'Epic Japan 様',
  description: null,
  statusName: '進行中',
  statusColor: '#22c55e',
  startDate: '2026-07-01',
  endDate: '2026-07-10',
  memberNames: ['新宮'],
  memberAvatarUrls: [null],
  memberCount: 1,
  taskCount: 4,
  completedTaskCount: 2,
  isMember: true,
  isOwner: true,
  archived: false,
  coverPhotoUrl: null,
  coverPhotoIdx: 0,
  location: null,
  placeId: null,
} satisfies ProjectDto

const SECOND_PROJECT = {
  ...STUB_PROJECT,
  id: 'proj-2',
  title: 'Alpha Corp 様',
  startDate: '2026-07-02',
} satisfies ProjectDto

const STUB_MEMBER = {
  userId: 'user-1',
  displayName: '新宮',
  avatarUrl: null,
  email: null,
  role: 'admin',
  joinedAt: '2026-07-01',
  projectCount: 1,
} satisfies WorkspaceMemberDto

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProjectListView />
    </QueryClientProvider>,
  )
}

describe('ProjectListView', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.projects_list_view, 'table')
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/projects') return new Response(JSON.stringify([STUB_PROJECT]), { status: 200 })
      if (url === '/api/projects/statuses') return new Response(JSON.stringify([]), { status: 200 })
      if (url === '/api/workspaces/members') return new Response(JSON.stringify([STUB_MEMBER]), { status: 200 })
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

  it('詳細パネルが開いていない時はテーブル表示のまま', async () => {
    renderView()

    expect(await screen.findByText('プロジェクト')).toBeInTheDocument()
    expect(screen.queryByText('詳細パネル表示中は、一覧の読みやすさを優先してカード表示に切り替えています。')).toBeNull()
  })

  it('詳細パネルが開いている時はカード表示へ退避する', async () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')

    renderView()

    expect(await screen.findByText('詳細パネル表示中は、一覧の読みやすさを優先してカード表示に切り替えています。')).toBeInTheDocument()
    expect(screen.queryByText('プロジェクト')).toBeNull()
    expect(screen.getAllByText('Epic Japan 様').length).toBeGreaterThan(0)
  })

  it('メンバー詳細パネルが開いている時もカード表示へ退避する', async () => {
    mockSearchParams = new URLSearchParams('open=member-user-1')

    renderView()

    expect(await screen.findByText('詳細パネル表示中は、一覧の読みやすさを優先してカード表示に切り替えています。')).toBeInTheDocument()
  })

  it('無効な詳細パネルURLではカード表示へ退避しない', async () => {
    mockSearchParams = new URLSearchParams('open=member-missing-user')

    renderView()

    expect(await screen.findByText('プロジェクト')).toBeInTheDocument()
    expect(screen.queryByText('詳細パネル表示中は、一覧の読みやすさを優先してカード表示に切り替えています。')).toBeNull()
  })

  it('詳細パネル退避中のカード順はテーブルソート順に合わせる', async () => {
    mockSearchParams = new URLSearchParams('open=project-proj-1')
    localStorage.setItem(STORAGE_KEYS.projects_table_sort, JSON.stringify({ key: 'title', dir: 'asc' }))
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/projects') return new Response(JSON.stringify([STUB_PROJECT, SECOND_PROJECT]), { status: 200 })
      if (url === '/api/projects/statuses') return new Response(JSON.stringify([]), { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const { container } = renderView()

    await screen.findByText('詳細パネル表示中は、一覧の読みやすさを優先してカード表示に切り替えています。')
    const cards = Array.from(container.querySelectorAll('[data-list-index]'))
    expect(cards).toHaveLength(2)
    expect(cards[0]?.textContent).toContain('Alpha Corp 様')
    expect(cards[1]?.textContent).toContain('Epic Japan 様')
  })
})
