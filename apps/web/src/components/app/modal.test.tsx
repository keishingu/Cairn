// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { createPortal } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { Modal, portalHostFor } from './primitives'

const Harness = ({ autoFocusInput = false }: { autoFocusInput?: boolean }) => {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="app-root">
      <button type="button">背後</button>
      <button type="button" onClick={() => setOpen(true)}>開く</button>
      {open && (
        <Modal onClose={() => setOpen(false)} label="タスクを追加">
          <div>
            {autoFocusInput && <input aria-label="タイトル" autoFocus />}
            <button type="button" onClick={() => setOpen(false)}>キャンセル</button>
            <button type="button">実行</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// 担当者選択のように、クリック位置に合わせて portal でメニューを出す部品
const PortalMenu = () => {
  const ref = React.useRef<HTMLDivElement>(null)
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => setHost(portalHostFor(ref.current)), [])
  return (
    <div ref={ref}>
      {host && createPortal(
        <div role="listbox" aria-label="担当者">
          <button type="button">山田</button>
          <button type="button">佐藤</button>
        </div>,
        host,
      )}
    </div>
  )
}

describe('Modal', () => {
  it('ラベルを名前に持つダイアログとして開き、中へフォーカスを移す', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '開く' }))

    expect(screen.getByRole('dialog', { name: 'タスクを追加' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
  })

  it('Tab を中で循環させ、背後へ抜けない', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '開く' }))

    await user.tab()
    expect(screen.getByRole('button', { name: '実行' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '実行' })).toHaveFocus()
  })

  it('Escape で閉じ、開いた元のボタンへフォーカスを戻す', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '開く' })
    await user.click(opener)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('中身が autoFocus を持っていても、閉じると開いた元へ戻す', async () => {
    const user = userEvent.setup()
    render(<Harness autoFocusInput />)
    const opener = screen.getByRole('button', { name: '開く' })
    await user.click(opener)
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('重ねたときは Escape で上のものだけを閉じる', async () => {
    const user = userEvent.setup()
    const Nested = () => {
      const [confirmOpen, setConfirmOpen] = React.useState(false)
      return (
        <div className="app-root">
          <Modal onClose={() => {}} label="編集">
            <div>
              <button type="button" onClick={() => setConfirmOpen(true)}>削除</button>
              <button type="button">保存</button>
            </div>
            {confirmOpen && (
              <Modal onClose={() => setConfirmOpen(false)} label="確認" role="alertdialog">
                <div>
                  <button type="button">キャンセル</button>
                  <button type="button">削除する</button>
                </div>
              </Modal>
            )}
          </Modal>
        </div>
      )
    }
    render(<Nested />)

    const openConfirm = screen.getByRole('button', { name: '削除' })
    await user.click(openConfirm)
    expect(screen.getByRole('alertdialog', { name: '確認' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('dialog', { name: '編集' })).toBeInTheDocument()
    await waitFor(() => expect(openConfirm).toHaveFocus())
  })

  it('portalHostFor で出したメニューはモーダル内に置かれ、Tab でたどれる', async () => {
    const user = userEvent.setup()
    render(
      <div className="app-root">
        <button type="button">背後</button>
        <Modal onClose={() => {}} label="タスクを編集">
          <div>
            <button type="button">閉じる</button>
            <PortalMenu />
          </div>
        </Modal>
      </div>,
    )

    const dialog = screen.getByRole('dialog', { name: 'タスクを編集' })
    await waitFor(() => expect(screen.getByRole('listbox', { name: '担当者' })).toBeInTheDocument())
    expect(dialog).toContainElement(screen.getByRole('listbox', { name: '担当者' }))

    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '山田' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '佐藤' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()
  })
})
