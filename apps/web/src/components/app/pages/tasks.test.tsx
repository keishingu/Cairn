import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageTasks } from './tasks'
import type { TaskListResponse } from '@/app/api/tasks/route'

vi.mock('./create-task-modal', () => ({
  CreateTaskModal: () => <div data-testid="create-task-modal" />,
}))

vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: () => null,
}))

vi.mock('../row-action-menu', () => ({
  RowActionMenu: () => null,
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

vi.mock('@/hooks/use-list-selection', () => ({
  useListSelection: () => ({ selectedIndex: -1, setSelectedIndex: vi.fn() }),
}))

const mockFetchWithAuth = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: (url: string, init?: RequestInit) => mockFetchWithAuth(url, init),
}))

function renderPage() {
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
    mockFetchWithAuth.mockReset()
    const firstPage: TaskListResponse = {
      items: [
        {
          id: 't1',
          projectId: 'p1',
          projectTitle: 'Alpha',
          title: '最初のタスク',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assigneeName: null,
          assigneeAvatarUrl: null,
          isLinkedToMessage: false,
        },
      ],
      nextCursor: '2026-07-09T08:00:00.000Z::t1',
    }
    const secondPage: TaskListResponse = {
      items: [
        {
          id: 't2',
          projectId: 'p2',
          projectTitle: 'Beta',
          title: '次のタスク',
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
    mockFetchWithAuth
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(secondPage), { status: 200 }))
  })

  it('さらに読み込むで次ページのタスクを追加表示する', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('最初のタスク')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'さらに読み込む' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'さらに読み込む' }))

    expect(await screen.findByText('次のタスク')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'さらに読み込む' })).toBeNull()
    })

    expect(mockFetchWithAuth).toHaveBeenNthCalledWith(1, '/api/tasks?limit=50', undefined)
    expect(mockFetchWithAuth).toHaveBeenNthCalledWith(2, '/api/tasks?limit=50&cursor=2026-07-09T08%3A00%3A00.000Z%3A%3At1', undefined)
  })
})
