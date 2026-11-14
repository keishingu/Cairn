import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { TaskDeleteDialog } from './task-delete-dialog'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

const task = { id: 'task-1', title: 'レビュー対応' }

function renderDialog(props: Partial<React.ComponentProps<typeof TaskDeleteDialog>> = {}) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TaskDeleteDialog task={task} onClose={onClose} {...props} />
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('TaskDeleteDialog', () => {
  beforeEach(() => mockFetch.mockReset())

  it('task が null のときは何も表示しない', () => {
    renderDialog({ task: null })

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('削除確認では task title の Markdown 記法をそのまま見せない', () => {
    renderDialog({ task: { id: 'task-1', title: 'Kei - **レビュー対応** を `確認`' } })

    expect(screen.getByRole('heading', { name: 'タスクを削除しますか？' })).toBeInTheDocument()
    expect(screen.getByText('「Kei - レビュー対応 を 確認」を削除します。この操作は元に戻せません。')).toBeInTheDocument()
  })

  it('削除に成功したら onDeleted を呼んで閉じる', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'task-1' }), { status: 200 }))
    const onDeleted = vi.fn()
    const { onClose } = renderDialog({ onDeleted })

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/task-1', { method: 'DELETE' })
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('削除に失敗したらダイアログを開いたままエラーを表示する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: '権限がありません' }), { status: 403 }))
    const onDeleted = vi.fn()
    const { onClose } = renderDialog({ onDeleted })

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(await screen.findByText('権限がありません')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
