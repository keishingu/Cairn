import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { TaskEditDialog } from './task-edit-dialog'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

const mockedFetchWithAuth = vi.mocked(fetchWithAuth)

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
  description: '結果メモ',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  isCheckboxTask: false,
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
  it('説明を編集すると PATCH し、空欄は null にして最大文字数を保つ', async () => {
    mockedFetchWithAuth.mockResolvedValue({ ok: true } as Response)
    renderDialog('edit')

    const description = screen.getByRole('textbox', { name: '説明' })
    expect(description).toHaveAttribute('maxlength', '2000')
    fireEvent.change(description, { target: { value: '更新した説明' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenCalledWith(
      '/api/tasks/task-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: task.title,
          description: '更新した説明',
          priority: task.priority,
          dueDate: null,
          assigneeId: null,
        }),
      }),
    ))

    fireEvent.change(description, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenLastCalledWith(
      '/api/tasks/task-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: task.title,
          description: null,
          priority: task.priority,
          dueDate: null,
          assigneeId: null,
        }),
      }),
    ))
  })

  it('削除導線では確認ダイアログだけを表示する', () => {
    renderDialog('delete')

    expect(screen.getByRole('heading', { name: 'タスクを削除しますか？' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'タスクを編集' })).toBeNull()
  })

  it('編集導線では編集ダイアログを表示する', () => {
    renderDialog('edit')

    expect(screen.getByRole('heading', { name: 'タスクを編集' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'タイトル *' })).toHaveValue(task.title)
    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue(task.description)
    expect(screen.getByRole('textbox', { name: '説明' })).toHaveAttribute('maxlength', '2000')
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
