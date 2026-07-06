import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageTasks } from './tasks'
import type { TaskListPage } from '@/app/api/tasks/route'

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: fetchWithAuthMock,
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

vi.mock('@/hooks/use-list-selection', () => ({
  useListSelection: () => ({ selectedIndex: -1, setSelectedIndex: vi.fn() }),
}))

vi.mock('./create-task-modal', () => ({
  CreateTaskModal: () => null,
}))

vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: () => null,
}))

vi.mock('../row-action-menu', () => ({
  RowActionMenu: () => null,
}))

const PAGE_1: TaskListPage = {
  tasks: [
    {
      id: 'task-2',
      projectId: 'project-a',
      projectTitle: 'Alpha',
      title: '二番目のタスク',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      assigneeName: null,
      assigneeAvatarUrl: null,
      isLinkedToMessage: false,
    },
  ],
  nextCursor: '2026-07-01T00:00:00.000Z__task-2',
}

const PAGE_2: TaskListPage = {
  tasks: [
    {
      id: 'task-1',
      projectId: 'project-b',
      projectTitle: 'Beta',
      title: '追加で読むタスク',
      status: 'done',
      priority: 'low',
      dueDate: null,
      assigneeName: null,
      assigneeAvatarUrl: null,
      isLinkedToMessage: false,
    },
  ],
  nextCursor: null,
}

function renderPageTasks() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PageTasks />
    </QueryClientProvider>,
  )
}

describe('PageTasks', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset()
    fetchWithAuthMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/tasks?limit=50') {
        return { ok: true, json: async () => PAGE_1 }
      }
      if (url === `/api/tasks?limit=50&cursor=${encodeURIComponent(PAGE_1.nextCursor!)}`) {
        return { ok: true, json: async () => PAGE_2 }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  })

  it('ページをまたいでタスクをさらに読み込める', async () => {
    renderPageTasks()

    expect(await screen.findByText('二番目のタスク')).toBeInTheDocument()
    const moreButton = await screen.findByRole('button', { name: 'さらに読み込む' })
    await userEvent.click(moreButton)

    expect(await screen.findByText('追加で読むタスク')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'さらに読み込む' })).toBeNull()
  })
})
