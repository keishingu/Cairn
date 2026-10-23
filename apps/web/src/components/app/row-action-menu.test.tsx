import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RowActionMenu, placeMenuVertically } from './row-action-menu'

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

describe('行の操作メニューの縦位置', () => {
  it('下に収まるときはトリガーの下に出す', () => {
    expect(placeMenuVertically({ top: 100, bottom: 120 }, 150, { top: 0, bottom: 800 })).toBe(124)
  })

  it('下に収まらないときはトリガーの上に出す', () => {
    expect(placeMenuVertically({ top: 700, bottom: 720 }, 150, { top: 0, bottom: 800 })).toBe(546)
  })

  it('上下どちらにも収まらないときは画面内に寄せる', () => {
    expect(placeMenuVertically({ top: 100, bottom: 120 }, 190, { top: 0, bottom: 300 })).toBe(106)
    expect(placeMenuVertically({ top: 100, bottom: 120 }, 400, { top: 0, bottom: 300 })).toBe(4)
  })

  it('セーフエリアに重ならない範囲に収める', () => {
    // 下のセーフエリアを除くと下には収まらないので上へ出す
    expect(placeMenuVertically({ top: 600, bottom: 620 }, 150, { top: 0, bottom: 800 }, { top: 0, bottom: 34 })).toBe(446)
    // 上下どちらにも収まらないときは、下のセーフエリアの手前に寄せる
    expect(placeMenuVertically({ top: 100, bottom: 120 }, 190, { top: 0, bottom: 300 }, { top: 0, bottom: 34 })).toBe(72)
    // 上のセーフエリアより上へは出さない
    expect(placeMenuVertically({ top: 100, bottom: 120 }, 400, { top: 0, bottom: 300 }, { top: 20, bottom: 34 })).toBe(24)
  })

  it('キーボードなどで見える範囲が狭いときは、その範囲に収める', () => {
    // 画面全体（800）なら下に収まるが、見える範囲の下端（500）を越えるので上へ出す
    expect(placeMenuVertically({ top: 400, bottom: 420 }, 150, { top: 0, bottom: 500 })).toBe(246)
    // 見える範囲が下へずれているときは、その上端より上へ出さない
    expect(placeMenuVertically({ top: 250, bottom: 270 }, 400, { top: 200, bottom: 500 })).toBe(204)
  })
})
