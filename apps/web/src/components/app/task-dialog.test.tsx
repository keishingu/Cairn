import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskDialog } from './task-dialog'

describe('TaskDialog', () => {
  it('画面高を超える入力欄だけをスクロールし、操作ボタンを表示し続ける', () => {
    render(
      <TaskDialog
        title="タスクを追加"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        submitLabel="追加"
        submittingLabel="追加中..."
        isSubmitting={false}
      >
        <div>入力欄</div>
      </TaskDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'タスクを追加' })
    const body = dialog.querySelector<HTMLElement>('[data-task-dialog-body]')
    const actions = dialog.querySelector<HTMLElement>('[data-task-dialog-actions]')

    expect(dialog).toHaveStyle({ maxHeight: 'calc(100dvh - 48px)' })
    expect(body).toHaveStyle({ overflowY: 'auto', minHeight: '0' })
    expect(actions).toHaveStyle({ flexShrink: '0' })
    expect(screen.getByRole('button', { name: '追加' })).toBeVisible()
  })
})
