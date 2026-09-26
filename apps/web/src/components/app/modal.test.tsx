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
})
