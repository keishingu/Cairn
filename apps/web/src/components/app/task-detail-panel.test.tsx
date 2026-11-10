import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDetailDto } from '@/app/api/tasks/[id]/route'
import { TaskDetailPanel } from './task-detail-panel'

const { mockUseTaskDetail, mockPatchMutate, mockPatchMutateAsync, mockPatchState } = vi.hoisted(() => ({
  mockUseTaskDetail: vi.fn(),
  mockPatchMutate: vi.fn(),
  mockPatchMutateAsync: vi.fn(),
  mockPatchState: { isError: false, isPending: false, error: null as Error | null },
}))

vi.mock('@/hooks/use-tasks', () => ({
  useTaskDetail: mockUseTaskDetail,
  usePatchTask: () => ({ mutate: mockPatchMutate, mutateAsync: mockPatchMutateAsync, reset: () => { mockPatchState.isError = false; mockPatchState.error = null }, ...mockPatchState }),
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('./task-assignee-field', () => ({
  TaskAssigneeField: ({ channelIsPrivate }: { channelIsPrivate?: boolean }) => (
    <div data-testid="assignee-field" data-members-only={String(!!channelIsPrivate)} />
  ),
}))

const baseTask: TaskDetailDto = {
  id: 'task-1',
  projectId: 'project-1',
  projectTitle: 'Alpha',
  channelId: 'channel-1',
  channelName: '全体',
  channelType: 'project',
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
  description: null,
  createdAt: '2026-09-01T03:00:00.000Z',
  createdByName: '山田 太郎',
  sourceMessage: null,
}

function setTask(overrides: Partial<TaskDetailDto> = {}) {
  mockUseTaskDetail.mockReturnValue({
    data: { ...baseTask, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })
}

function renderPanel(isMobile = false) {
  const onClose = vi.fn()
  render(<TaskDetailPanel taskId="task-1" onClose={onClose} isMobile={isMobile} />)
  return { onClose }
}

describe('TaskDetailPanel', () => {
  beforeEach(() => {
    mockUseTaskDetail.mockReset()
    mockPatchMutate.mockReset()
    mockPatchMutateAsync.mockReset()
    mockPatchState.isError = false
    mockPatchState.isPending = false
    mockPatchState.error = null
  })

  it('タイトル・スコープ・作成者を表示する', () => {
    setTask()
    renderPanel()

    const dialog = screen.getByRole('dialog', { name: 'タスクの詳細' })
    expect(within(dialog).getByText('Alpha')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'タイトルを編集' })).toHaveTextContent('レビュー対応')
    expect(within(dialog).getByText(/山田 太郎/)).toBeInTheDocument()
  })

  it('DM 由来のタスクは担当者候補を参加者に絞る', () => {
    setTask({ projectId: null, projectTitle: null, channelType: 'dm', channelIsPrivate: false })
    renderPanel()

    expect(screen.getByTestId('assignee-field')).toHaveAttribute('data-members-only', 'true')
  })

  it('読み込み中はローディングを表示する', () => {
    mockUseTaskDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() })
    renderPanel()

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
  })

  it('取得に失敗したらエラーを表示し、再試行できる', async () => {
    const refetch = vi.fn()
    mockUseTaskDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Task not found'), refetch })
    renderPanel()

    expect(screen.getByRole('alert')).toHaveTextContent('Task not found')
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('タイトルをクリックして編集し、Enter で保存して編集を閉じる', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    const input = screen.getByRole('textbox', { name: 'タイトル' })
    await userEvent.clear(input)
    await userEvent.type(input, '新しいタイトル{Enter}')

    expect(mockPatchMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'task-1', patch: { title: '新しいタイトル' } })
    expect(await screen.findByRole('button', { name: 'タイトルを編集' })).toBeInTheDocument()
  })

  it('タイトルは保存ボタンでも保存できる', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'task-1', patch: { title: 'レビュー対応 追記' } })
  })

  it('タイトルが変わっていない・空のときは保存ボタンが無効で、Enter でも保存しない', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), '{Enter}')
    const input = screen.getByRole('textbox', { name: 'タイトル' })
    await userEvent.clear(input)
    await userEvent.type(input, '{Enter}')

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(mockPatchMutateAsync).not.toHaveBeenCalled()
  })

  it('タイトルは blur では保存も破棄もせず、下書きを残す', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    await userEvent.tab()
    await userEvent.tab()

    expect(mockPatchMutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue('レビュー対応 追記')
  })

  it('タイトルはキャンセルボタンと Esc で破棄し、パネルは閉じない', async () => {
    setTask()
    const { onClose } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.getByRole('button', { name: 'タイトルを編集' })).toHaveTextContent('レビュー対応')

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'タイトルを編集' })).toHaveTextContent('レビュー対応')
    expect(mockPatchMutateAsync).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('タイトルの保存に失敗したら編集を閉じず、下書きとエラーを残す', async () => {
    setTask()
    mockPatchMutateAsync.mockRejectedValueOnce(new Error('保存に失敗しました'))
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記{Enter}')

    expect(await screen.findByText('保存に失敗しました')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue('レビュー対応 追記')
  })

  it('説明は Ctrl+Enter で保存できる', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '説明を追加' }))
    await userEvent.type(screen.getByRole('textbox', { name: '説明' }), '内容{Control>}{Enter}{/Control}')

    expect(mockPatchMutate).toHaveBeenCalledWith(
      { id: 'task-1', patch: { description: '内容' } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('未保存の下書きがあっても、閉じる操作は確認なしで閉じる', async () => {
    setTask()
    const { onClose } = renderPanel()
    const confirm = vi.spyOn(window, 'confirm')

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('ステータス・優先度・期日の変更は即保存する', async () => {
    setTask()
    renderPanel()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'ステータス' }), 'done')
    expect(mockPatchMutate).toHaveBeenLastCalledWith({ id: 'task-1', patch: { status: 'done' } })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '優先度' }), 'high')
    expect(mockPatchMutate).toHaveBeenLastCalledWith({ id: 'task-1', patch: { priority: 'high' } })
  })

  it('説明が空ならプレースホルダを出し、追加して保存できる', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '説明を追加' }))
    await userEvent.type(screen.getByRole('textbox', { name: '説明' }), '## 手順')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mockPatchMutate).toHaveBeenCalledWith(
      { id: 'task-1', patch: { description: '## 手順' } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('説明は Markdown として表示し、編集でキャンセルすると保存しない', async () => {
    setTask({ description: '## 手順\n- 確認する', hasDescription: true })
    renderPanel()

    expect(screen.getByRole('heading', { name: '手順' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '編集' }))
    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue('## 手順\n- 確認する')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(mockPatchMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '手順' })).toBeInTheDocument()
  })

  it('説明を全部消して保存すると null を送る', async () => {
    setTask({ description: '消す', hasDescription: true })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '編集' }))
    await userEvent.clear(screen.getByRole('textbox', { name: '説明' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mockPatchMutate).toHaveBeenCalledWith(
      { id: 'task-1', patch: { description: null } },
      expect.anything(),
    )
  })

  it('保存に失敗したらインラインエラーを表示する', () => {
    setTask()
    mockPatchState.isError = true
    mockPatchState.error = new Error('指定された担当者はこのタスクに割り当てできません')
    renderPanel()

    expect(screen.getByRole('alert')).toHaveTextContent('指定された担当者はこのタスクに割り当てできません')
  })

  it('説明の保存に失敗してもキャンセルして開き直せば、前回のエラーは出ない', async () => {
    setTask()
    const view = render(<TaskDetailPanel taskId="task-1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '説明を追加' }))
    // 保存に失敗した状態を再現する（親を再描画してエラーを表示する）
    mockPatchState.isError = true
    mockPatchState.error = new Error('説明を保存できませんでした')
    view.rerender(<TaskDetailPanel taskId="task-1" onClose={vi.fn()} />)
    expect(screen.getAllByText('説明を保存できませんでした').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    // キャンセルでミューテーションが reset され（モックでは状態が消え）、親が再描画される
    expect(mockPatchState.isError).toBe(false)
    view.rerender(<TaskDetailPanel taskId="task-1" onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '説明を追加' }))

    expect(screen.queryByText('説明を保存できませんでした')).toBeNull()
  })

  it('元のメッセージを引用ブロックで表示し、チャットで開くリンクを出す', async () => {
    setTask({
      sourceMessageId: 'message-1',
      isLinkedToMessage: true,
      sourceMessage: {
        id: 'message-1',
        channelId: 'channel-1',
        content: '**急ぎ**でお願いします @鈴木',
        senderName: '佐藤 花子',
        senderAvatarUrl: null,
        createdAt: '2026-08-31T09:00:00.000Z',
      },
    })
    const { onClose } = renderPanel()

    expect(screen.getByText('元のメッセージ')).toBeInTheDocument()
    expect(screen.getByText('佐藤 花子')).toBeInTheDocument()
    expect(screen.getByText('急ぎ')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'チャットで開く' })
    expect(link).toHaveAttribute('href', '/chats/channel-1?m=message-1')

    // jsdom は遷移を実装していないので、クリックの既定動作は止める
    link.addEventListener('click', e => e.preventDefault())
    await userEvent.click(link)
    expect(onClose).toHaveBeenCalled()
  })

  it('未保存のタイトルがあっても、チャットで開くリンクは確認せず閉じて遷移する', async () => {
    setTask({
      sourceMessageId: 'message-1',
      isLinkedToMessage: true,
      sourceMessage: {
        id: 'message-1', channelId: 'channel-1', content: '本文', senderName: '佐藤 花子',
        senderAvatarUrl: null, createdAt: '2026-08-31T09:00:00.000Z',
      },
    })
    const { onClose } = renderPanel()
    const confirm = vi.spyOn(window, 'confirm')

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'タイトル' }), ' 追記')
    const link = screen.getByRole('link', { name: 'チャットで開く' })
    link.addEventListener('click', e => e.preventDefault())
    await userEvent.click(link)

    expect(confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('元のメッセージが無いタスクには元のメッセージ欄を出さない', () => {
    setTask()
    renderPanel()

    expect(screen.queryByText('元のメッセージ')).toBeNull()
  })

  it('紐付けがあるのに元のメッセージを返せないときは、その旨を表示する', () => {
    setTask({ sourceMessageId: 'message-1', isLinkedToMessage: true, sourceMessage: null })
    renderPanel()

    expect(screen.getByText('元のメッセージ')).toBeInTheDocument()
    expect(screen.getByText('元のメッセージは削除されたため表示できません')).toBeInTheDocument()
  })

  it('削除ボタンで確認ダイアログを開く', async () => {
    setTask()
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'タスクを削除しますか？' })).toBeInTheDocument()
  })

  it('モバイルでは全画面幅で表示する', () => {
    setTask()
    renderPanel(true)

    expect(document.querySelector<HTMLElement>('[data-task-detail-panel]')?.style.width).toBe('100%')
  })

  it('入力中の Esc は編集の取り消しだけで、パネルは閉じない', async () => {
    setTask()
    const { onClose } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'タイトルを編集' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'タイトルを編集' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
