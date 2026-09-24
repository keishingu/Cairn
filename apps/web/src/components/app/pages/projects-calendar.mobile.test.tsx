// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import type { ProjectDto } from '@/app/api/projects/route'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageCalendar } from './projects-calendar'

vi.mock('@/components/app/mobile/header', () => ({
  MobileHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      {right}
    </div>
  ),
}))

vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({
    initialStartDate,
    initialEndDate,
    onCreated,
  }: {
    initialStartDate: string
    initialEndDate: string
    onCreated: (project: ProjectDto) => void
  }) => {
    const queryClient = useQueryClient()
    const project: ProjectDto = {
      id: 'created-project',
      title: '新規予定',
      description: null,
      statusName: null,
      statusColor: null,
      startDate: initialStartDate,
      endDate: initialEndDate,
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
        <div>{initialStartDate} - {initialEndDate}</div>
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

const mockUseWorkspacePermissions = vi.fn(() => ({
  wsRole: 'owner',
  isOwner: true,
  isAdmin: true,
  isMember: true,
  isGuest: false,
}))

vi.mock('@/hooks/use-current-user', () => ({
  useWorkspacePermissions: () => mockUseWorkspacePermissions(),
  useCurrentUser: () => ({ data: undefined }),
}))

vi.mock('@/lib/use-workspace-settings', () => ({
  useProjectLabel: () => '予定',
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

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekdayInCurrentMonth(weekday: number): Date {
  const today = new Date()
  for (let day = 1; day <= 28; day++) {
    const d = new Date(today.getFullYear(), today.getMonth(), day)
    if (d.getDay() === weekday) return d
  }
  throw new Error(`weekday ${weekday} not found`)
}

function makeProject(overrides: Partial<ProjectDto> = {}): ProjectDto {
  return {
    id: 'project-1',
    title: '連続期間の山行',
    description: null,
    statusName: null,
    statusColor: '#2563EB',
    startDate: iso(new Date()),
    endDate: iso(new Date()),
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
    ...overrides,
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

function mockCalendarApis(projects: ProjectDto[] = []) {
  mockFetchWithAuth.mockImplementation(async (url: string) => {
    if (url === '/api/projects') return jsonResponse(projects)
    if (url === '/api/projects/statuses') return jsonResponse([])
    if (url === '/api/calendar/google/status') return jsonResponse({ connected: false, configured: false })
    if (url === '/api/milestones') return jsonResponse([])
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

function renderPage(openPanel = vi.fn()) {
  const queryClient = makeQueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PageCalendar isMobile openPanel={openPanel} />
    </QueryClientProvider>,
  )
  return { queryClient, openPanel, ...view }
}

describe('PageCalendar (モバイル)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    mockFetchWithAuth.mockReset()
    mockUseWorkspacePermissions.mockReset()
    mockUseWorkspacePermissions.mockReturnValue({
      wsRole: 'owner',
      isOwner: true,
      isAdmin: true,
      isMember: true,
      isGuest: false,
    })
    mockCalendarApis()
  })

  it('月表示で選択中の空き日をタップすると作成シートが開く', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][today.getDay()]})`
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: todayLabel }))

    expect(await screen.findByTestId('create-project-sheet')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })

  it('月表示で選択中の予定あり日をタップしても作成シートを開ける', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][today.getDay()]})`
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    mockCalendarApis([makeProject({ id: 'existing-project', title: '既存予定', statusColor: null, startDate: todayIso, endDate: todayIso })])

    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: todayLabel }))

    expect(await screen.findByTestId('create-project-sheet')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })

  it('週表示の空状態からもその日の作成シートを開ける', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    renderPage()

    await user.click(screen.getByRole('button', { name: '週' }))
    await user.click(await screen.findByRole('button', { name: 'この日に新規予定' }))

    expect(await screen.findByTestId('create-project-sheet')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })

  it('週表示で予定あり日でもその日の作成シートを開ける', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    mockCalendarApis([makeProject({ id: 'existing-project', title: '既存予定', statusColor: null, startDate: todayIso, endDate: todayIso })])

    renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: '週' }))
    await user.click(await screen.findByRole('button', { name: 'この日に新規予定' }))

    expect(await screen.findByTestId('create-project-sheet')).toHaveTextContent(`${todayIso} - ${todayIso}`)
  })

  it('管理者でない場合はモバイル作成導線を出さない', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][today.getDay()]})`
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

    await user.click(screen.getByRole('button', { name: todayLabel }))

    expect(screen.queryByTestId('create-project-sheet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'この日に新規予定' })).not.toBeInTheDocument()
  })

  it('モバイル作成完了時に projects キャッシュへ二重追加しない', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日(${['日', '月', '火', '水', '木', '金', '土'][today.getDay()]})`
    const { queryClient } = renderPage()

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/projects')
    })

    await user.click(screen.getByRole('button', { name: todayLabel }))
    await user.click(await screen.findByRole('button', { name: '作成完了' }))

    expect(queryClient.getQueryData<ProjectDto[]>(['projects'])).toEqual([
      expect.objectContaining({ id: 'created-project', title: '新規予定' }),
    ])
  })

  it('上スワイプで次の月、下スワイプで前の月に移る', async () => {
    renderPage()
    const today = new Date()
    const label = (offset: number) => {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
      return `${d.getFullYear()}年${d.getMonth() + 1}月`
    }
    expect(await screen.findByText(label(0))).toBeInTheDocument()
    const grid = screen.getByTestId('month-calendar')

    fireEvent.touchStart(grid, { changedTouches: [{ clientX: 40, clientY: 220 }] })
    fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 40, clientY: 80 }] })
    expect(screen.getByText(label(1))).toBeInTheDocument()

    fireEvent.touchStart(grid, { changedTouches: [{ clientX: 40, clientY: 80 }] })
    fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 40, clientY: 220 }] })
    expect(screen.getByText(label(0))).toBeInTheDocument()
  })

  it('短い縦移動では月を変えない', async () => {
    renderPage()
    const today = new Date()
    const label = `${today.getFullYear()}年${today.getMonth() + 1}月`
    expect(await screen.findByText(label)).toBeInTheDocument()
    const grid = screen.getByTestId('month-calendar')

    fireEvent.touchStart(grid, { changedTouches: [{ clientX: 40, clientY: 120 }] })
    fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 40, clientY: 100 }] })

    expect(screen.getByText(label)).toBeInTheDocument()
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    expect(screen.queryByText(`${next.getFullYear()}年${next.getMonth() + 1}月`)).not.toBeInTheDocument()
  })

  it('月曜始まりでは曜日見出しが月曜から並ぶ', () => {
    window.localStorage.setItem('cairn:calendar_week_start', 'monday')
    renderPage()

    expect(screen.getAllByTestId('weekday-label').map((node) => node.textContent)).toEqual([
      '月', '火', '水', '木', '金', '土', '日',
    ])
  })

  it('PCの月表示ではホイールで次の月へ移る', async () => {
    const queryClient = makeQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PageCalendar openPanel={vi.fn()} />
      </QueryClientProvider>,
    )
    const today = new Date()
    const current = `${today.getFullYear()}年${today.getMonth() + 1}月`
    const nextDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const next = `${nextDate.getFullYear()}年${nextDate.getMonth() + 1}月`
    expect(await screen.findByText(current)).toBeInTheDocument()

    await act(async () => {
      screen.getByTestId('month-calendar').dispatchEvent(
        new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }),
      )
    })

    expect(screen.getByText(next)).toBeInTheDocument()
  })

  it('週表示のホイールでは表示中の週を変えない', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    const user = userEvent.setup()
    const queryClient = makeQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PageCalendar openPanel={vi.fn()} />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: '週' }))
    const label = screen.getByText(/–/)
    const before = label.textContent
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    await act(async () => {
      label.dispatchEvent(event)
    })
    expect(label).toHaveTextContent(before ?? '')
    expect(event.defaultPrevented).toBe(false)
  })

  it('月表示では同一週の連続日付を1本の矩形で表示する', async () => {
    const user = userEvent.setup()
    const monday = weekdayInCurrentMonth(1)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    mockCalendarApis([makeProject({ startDate: iso(monday), endDate: iso(friday) })])
    const { openPanel } = renderPage()

    const bar = await screen.findByRole('button', { name: '連続期間の山行' })
    expect(screen.getAllByRole('button', { name: '連続期間の山行' })).toHaveLength(1)

    await user.click(bar)
    expect(openPanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1', title: '連続期間の山行' }))
  })

  it('月表示では週をまたぐ連続日付を週ごとに分割した矩形で表示する', async () => {
    const saturday = weekdayInCurrentMonth(6)
    const sunday = new Date(saturday)
    sunday.setDate(saturday.getDate() + 1)
    mockCalendarApis([makeProject({ startDate: iso(saturday), endDate: iso(sunday) })])
    renderPage()

    expect(await screen.findAllByRole('button', { name: '連続期間の山行' })).toHaveLength(2)
  })
})
