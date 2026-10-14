import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/app/api/tasks/route'
import { PageTasks } from './tasks'

const { mockUseTasks, mockToggleMutate, mockSearchParamsGet, mockSearchParamsToString, mockUseCurrentUser } = vi.hoisted(() => ({
  mockUseTasks: vi.fn(),
  mockUseCurrentUser: vi.fn(),
  mockToggleMutate: vi.fn(),
  mockSearchParamsGet: vi.fn(),
  mockSearchParamsToString: vi.fn(() => ''),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet, toString: mockSearchParamsToString }),
}))
vi.mock('@/hooks/use-tasks', () => ({
  useTasks: mockUseTasks,
  useToggleTaskStatus: () => ({ mutate: mockToggleMutate, isPending: false }),
}))
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: mockUseCurrentUser }))
vi.mock('../task-detail-panel', () => ({
  TaskDetailPanel: ({ taskId, isMobile, onClose }: { taskId: string; isMobile?: boolean; onClose: () => void }) => (
    <div data-testid="task-detail-panel" data-task-id={taskId} data-mobile={String(!!isMobile)}>
      <button type="button" onClick={onClose}>close-panel</button>
    </div>
  ),
}))
vi.mock('../task-delete-dialog', () => ({
  TaskDeleteDialog: ({ task }: { task: { id: string } | null }) => (task ? <div data-testid="task-delete-dialog" data-task-id={task.id} /> : null),
}))
vi.mock('./create-task-modal', () => ({ CreateTaskModal: () => null }))
vi.mock('@/lib/command-registry', () => ({ useCommand: vi.fn() }))

function makeTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-1',
    projectId: 'project-1',
    projectTitle: 'Alpha',
    channelId: null,
    channelName: null,
    channelType: null,
    channelIsPrivate: false,
    title: 'レビュー対応',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    assigneeId: null,
    assigneeName: null,
    assigneeAvatarUrl: null,
    sourceMessageId: null,
    isLinkedToMessage: false,
    hasDescription: false,
    ...overrides,
  }
}

function renderPage(isMobile = false) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <PageTasks isMobile={isMobile} />
    </QueryClientProvider>,
  )
}

const ME = 'user-me'

describe('PageTasks のタスク詳細パネル導線', () => {
  beforeEach(() => {
    // このブロックは担当者を問わない導線のテストなので「全員」表示にする
    localStorage.clear()
    localStorage.setItem('cairn:tasks_scope', 'all')
    mockUseCurrentUser.mockReturnValue({ data: { id: ME }, isLoading: false, isError: false, error: null })
    // jsdom は scrollIntoView を実装していない（キーボード選択行のスクロール追従で呼ばれる）
    Element.prototype.scrollIntoView = vi.fn()
    mockToggleMutate.mockReset()
    mockSearchParamsGet.mockReset()
    mockSearchParamsGet.mockReturnValue(null)
    mockSearchParamsToString.mockReturnValue('')
    mockUseTasks.mockReturnValue({
      data: [
        makeTask(),
        makeTask({ id: 'task-2', title: '説明つきタスク', hasDescription: true, sourceMessageId: 'message-1', channelId: 'channel-1', isLinkedToMessage: true }),
      ],
      isLoading: false,
    })
  })

  it('行をクリックすると詳細パネルを開く', async () => {
    renderPage()

    await userEvent.click(screen.getByText('レビュー対応'))

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 'task-1')
  })

  it('モバイルでは詳細パネルに isMobile を渡す', async () => {
    renderPage(true)

    await userEvent.click(screen.getByText('レビュー対応'))

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-mobile', 'true')
  })

  it('チェック丸は完了切替だけを行い、詳細は開かない', async () => {
    renderPage()

    await userEvent.click(screen.getAllByRole('button', { name: 'タスクを完了にする' })[0]!)

    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'task-1', newStatus: 'done' })
    expect(screen.queryByTestId('task-detail-panel')).toBeNull()
  })

  it('💬リンクは詳細を開かない', async () => {
    renderPage()
    const link = screen.getByRole('link', { name: 'タスクを登録したメッセージへ移動' })
    link.addEventListener('click', e => e.preventDefault())

    await userEvent.click(link)

    expect(screen.queryByTestId('task-detail-panel')).toBeNull()
  })

  it('…メニューの「詳細を開く」で詳細を開き、「編集」は出さない', async () => {
    renderPage()
    const row = screen.getByText('レビュー対応').closest('[data-list-index]') as HTMLElement

    await userEvent.click(within(row).getByRole('button', { name: '操作' }))
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '詳細を開く' }))

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 'task-1')
  })

  it('…メニューの削除は確認ダイアログを開く', async () => {
    renderPage()
    const row = screen.getByText('レビュー対応').closest('[data-list-index]') as HTMLElement

    await userEvent.click(within(row).getByRole('button', { name: '操作' }))
    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(screen.getByTestId('task-delete-dialog')).toHaveAttribute('data-task-id', 'task-1')
    expect(screen.queryByTestId('task-detail-panel')).toBeNull()
  })

  it('説明のあるタスクにだけ説明ありのアイコンを出す', () => {
    renderPage()

    expect(screen.getAllByLabelText('説明があります')).toHaveLength(1)
    const withDescription = screen.getByText('説明つきタスク').closest('[data-list-index]') as HTMLElement
    expect(within(withDescription).getByLabelText('説明があります')).toBeInTheDocument()
  })

  it('?taskId= 付きで開くと詳細パネルを自動で開く', () => {
    mockSearchParamsGet.mockImplementation((key: string) => (key === 'taskId' ? 'task-2' : null))

    renderPage()

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 'task-2')
  })

  it('閉じた後に同じタスクを開き直す要求（open が変わる）で再び詳細パネルを開く', async () => {
    mockSearchParamsGet.mockImplementation((key: string) => (key === 'taskId' ? 'task-2' : null))
    mockSearchParamsToString.mockReturnValue('taskId=task-2&open=1')
    const view = renderPage()

    await userEvent.click(screen.getByText('close-panel'))
    expect(screen.queryByTestId('task-detail-panel')).not.toBeInTheDocument()

    mockSearchParamsToString.mockReturnValue('taskId=task-2&open=2')
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PageTasks />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 'task-2')
  })

  it('選択中の行で Enter を押すと詳細パネルを開く', async () => {
    renderPage()

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 'task-1')
  })
})

describe('PageTasks の担当範囲とタブの保存', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    mockSearchParamsGet.mockReturnValue(null)
    mockSearchParamsToString.mockReturnValue('')
    mockUseCurrentUser.mockReturnValue({ data: { id: ME }, isLoading: false, isError: false, error: null })
    mockUseTasks.mockReturnValue({
      data: [
        makeTask({ id: 'mine-todo', title: '自分の未着手', assigneeId: ME }),
        makeTask({ id: 'mine-done', title: '自分の完了', assigneeId: ME, status: 'done' }),
        makeTask({ id: 'other-todo', title: '他人の未着手', assigneeId: 'user-other' }),
        makeTask({ id: 'unassigned', title: '担当なし', assigneeId: null }),
      ],
      isLoading: false,
    })
  })

  it('既定では自分が担当のタスクだけを表示し、件数も自分の担当で数える', () => {
    renderPage()

    expect(screen.getByText('自分の未着手')).toBeInTheDocument()
    expect(screen.queryByText('他人の未着手')).not.toBeInTheDocument()
    expect(screen.queryByText('担当なし')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /未着手 \(1\)/ })).toBeInTheDocument()
  })

  it('「全員」に切り替えると他人・担当なしのタスクも表示し、選択を保存する', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '全員' }))

    expect(screen.getByText('他人の未着手')).toBeInTheDocument()
    expect(screen.getByText('担当なし')).toBeInTheDocument()
    expect(localStorage.getItem('cairn:tasks_scope')).toBe('all')
  })

  it('ステータスタブの選択を保存し、次に開いたときに復元する', async () => {
    const first = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /完了 \(1\)/ }))
    expect(localStorage.getItem('cairn:tasks_status_filter')).toBe('done')
    first.unmount()

    renderPage()

    expect(screen.getByText('自分の完了')).toBeInTheDocument()
    expect(screen.queryByText('自分の未着手')).not.toBeInTheDocument()
  })

  it('保存値が不正なら既定（自分の担当・未着手）で開く', () => {
    localStorage.setItem('cairn:tasks_scope', 'bogus')
    localStorage.setItem('cairn:tasks_status_filter', 'bogus')
    renderPage()

    expect(screen.getByText('自分の未着手')).toBeInTheDocument()
    expect(screen.queryByText('他人の未着手')).not.toBeInTheDocument()
  })

  it('自分の情報を取得できないときは全件で代替せずエラーを出す', () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('ユーザー情報の取得に失敗しました') })
    renderPage()

    expect(screen.getByText('ユーザー情報を読み込めませんでした')).toBeInTheDocument()
    expect(screen.queryByText('他人の未着手')).not.toBeInTheDocument()
  })
})
