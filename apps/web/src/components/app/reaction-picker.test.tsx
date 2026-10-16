// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactionPicker } from './reaction-picker'

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'user-1' } }),
}))

const Harness = ({ onSelect, onClose, isMobile }: { onSelect: (emoji: string) => void; onClose: () => void; isMobile?: boolean }) => {
  const ref = React.useRef<HTMLButtonElement>(null)
  return (
    <div className="app-root">
      <button ref={ref} type="button">anchor</button>
      <ReactionPicker anchorRef={ref} onSelect={onSelect} onClose={onClose} isMobile={isMobile ?? false} />
    </div>
  )
}

describe('リアクションの絵文字選択', () => {
  beforeEach(() => localStorage.clear())

  it('最近使った絵文字を先頭に並べ、足りない分を既定の絵文字で補う', () => {
    localStorage.setItem('cairn:reaction_history_user-1', JSON.stringify(['🔥', '🙏']))
    render(<Harness onSelect={vi.fn()} onClose={vi.fn()} />)
    const quick = screen.getAllByRole('button', { name: /を追加$/ }).map(button => button.textContent)
    expect(quick).toEqual(['🔥', '🙏', '👍', '❤️', '😂', '🎉'])
  })

  it('最近の絵文字を選ぶと選択を伝えて閉じる', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<Harness onSelect={onSelect} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '👍を追加' }))
    expect(onSelect).toHaveBeenCalledWith('👍')
    expect(onClose).toHaveBeenCalled()
  })

  it('「もっと見る」で全絵文字を開き、英語名で検索して選べる', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} onClose={vi.fn()} isMobile />)
    await user.click(screen.getByRole('button', { name: 'もっと見る' }))
    const search = await screen.findByRole('searchbox', { name: '英語名・絵文字で検索' }, { timeout: 5000 })
    await user.type(search, 'thumbs')
    await waitFor(() => expect(screen.getAllByRole('button', { name: '👎を追加' }).length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: '👎を追加' }))
    expect(onSelect).toHaveBeenCalledWith('👎')
    expect(screen.getByRole('button', { name: 'たたむ' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('モバイルWebでは背後を操作できないダイアログとして開き、閉じると開いたボタンへフォーカスを戻す', async () => {
    const user = userEvent.setup()
    const Toggle = () => {
      const ref = React.useRef<HTMLButtonElement>(null)
      const [open, setOpen] = React.useState(false)
      return (
        <div className="app-root">
          <button ref={ref} type="button" onClick={() => setOpen(true)}>開く</button>
          {open && <ReactionPicker anchorRef={ref} onSelect={vi.fn()} onClose={() => setOpen(false)} isMobile />}
        </div>
      )
    }
    render(<Toggle />)
    await user.click(screen.getByRole('button', { name: '開く' }))
    const dialog = screen.getByRole('dialog', { name: 'リアクション' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'リアクション' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開く' })).toHaveFocus()
  })

  it('保存済みの履歴が壊れていれば読み込めなかったことを表示する', () => {
    localStorage.setItem('cairn:reaction_history_user-1', '{broken')
    render(<Harness onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('最近のリアクションを読み込めませんでした')
  })
})
