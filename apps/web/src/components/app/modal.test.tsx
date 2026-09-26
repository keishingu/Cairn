// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { Modal } from './primitives'

const Harness = () => {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>開く</button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div role="dialog">
            <button type="button" onClick={() => setOpen(false)}>キャンセル</button>
            <button type="button">実行</button>
          </div>
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('開くと中へフォーカスを移し、Tab を中で循環させ、閉じると元へ戻す', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const opener = screen.getByRole('button', { name: '開く' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: '実行' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '実行' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('中の操作がすべて無効でも Tab で背後へ抜けない', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">背後</button>
        <Modal onClose={() => {}}>
          <div role="dialog">
            <button type="button" disabled>処理中…</button>
          </div>
        </Modal>
      </>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: '背後' })).not.toHaveFocus()
    expect(document.activeElement).toHaveAttribute('data-cairn-modal')
  })

  it('中身が autoFocus を持っていても、閉じると開いた元へ戻す', async () => {
    const user = userEvent.setup()
    const AutoFocusHarness = () => {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>開く</button>
          {open && (
            <Modal onClose={() => setOpen(false)}>
              <input aria-label="タイトル" autoFocus />
            </Modal>
          )}
        </>
      )
    }
    render(<AutoFocusHarness />)

    const opener = screen.getByRole('button', { name: '開く' })
    await user.click(opener)
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('重ねたモーダルでは上のものだけが Tab を循環させ、Escape で上だけを閉じる', async () => {
    const user = userEvent.setup()
    const Nested = () => {
      const [editorOpen, setEditorOpen] = React.useState(true)
      const [confirmOpen, setConfirmOpen] = React.useState(false)
      return editorOpen ? (
        <Modal onClose={() => setEditorOpen(false)}>
          <div role="dialog" aria-label="編集">
            <button type="button" onClick={() => setConfirmOpen(true)}>削除</button>
            <button type="button">保存</button>
          </div>
          {confirmOpen && (
            <Modal onClose={() => setConfirmOpen(false)}>
              <div role="alertdialog" aria-label="確認">
                <button type="button">キャンセル</button>
                <button type="button">削除する</button>
              </div>
            </Modal>
          )}
        </Modal>
      ) : null
    }
    render(<Nested />)

    const openConfirm = screen.getByRole('button', { name: '削除' })
    await user.click(openConfirm)
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: '削除する' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('dialog', { name: '編集' })).toBeInTheDocument()
    expect(openConfirm).toHaveFocus()
  })
})
