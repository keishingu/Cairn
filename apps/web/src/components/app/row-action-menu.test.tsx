import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RowActionMenu } from './row-action-menu'

describe('行の操作メニュー', () => {
  it.each(['{Enter}', ' '])('%sで操作を一度だけ実行し、行のクリックへ伝播しない', async key => {
    const onSelect = vi.fn()
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    render(<div onClick={onRowClick}><RowActionMenu actions={[{ icon: 'edit', label: '編集', onSelect }]} /></div>)

    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '操作' })).toHaveAttribute('aria-expanded', 'true')
    await user.tab()
    expect(screen.getByRole('button', { name: '編集' })).toHaveFocus()
    await user.keyboard(key)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '操作' })).toHaveFocus()
  })

  it('Escapeは操作を実行せずメニューを閉じ、トリガーへ戻す', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<RowActionMenu actions={[{ icon: 'edit', label: '編集', onSelect }]} />)
    await user.click(screen.getByRole('button', { name: '操作' }))
    await user.tab()
    await user.keyboard('{Escape}')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '操作' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '操作' })).toHaveAttribute('aria-expanded', 'false')
  })
})
