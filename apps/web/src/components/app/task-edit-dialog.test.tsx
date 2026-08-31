import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { TaskEditDialog } from './task-edit-dialog'

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}))

const task = {
  id: 'task-1',
  projectId: 'project-1',
  projectTitle: 'Alpha',
  channelId: null,
  channelName: null,
  channelIsPrivate: false,
  title: 'レビュー対応',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  isLinkedToMessage: false,
  assigneeId: null,
  assigneeName: null,
  assigneeAvatarUrl: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function renderDialog(initialMode: 'edit' | 'delete') {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <TaskEditDialog open task={task} initialMode={initialMode} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('TaskEditDialog', () => {
  it('削除導線では確認ダイアログだけを表示する', () => {
    renderDialog('delete')

    expect(screen.getByRole('heading', { name: 'タスクを削除しますか？' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'タスクを編集' })).toBeNull()
  })

  it('編集導線では編集ダイアログを表示する', () => {
    renderDialog('edit')

    expect(screen.getByRole('heading', { name: 'タスクを編集' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'タイトル *' })).toHaveValue(task.title)
    expect(screen.getByRole('combobox', { name: '優先度' })).toHaveValue('medium')
    expect(screen.getByLabelText('期限日')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'タスクを削除しますか？' })).toBeNull()
  })

  it('削除確認では task title の Markdown 記法をそのまま見せない', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <TaskEditDialog
          open
          task={{ ...task, title: 'Kei - **レビュー対応** を `確認`' }}
          initialMode="delete"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('「Kei - レビュー対応 を 確認」を削除します。この操作は元に戻せません。')).toBeInTheDocument()
  })
})
