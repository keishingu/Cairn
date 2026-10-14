// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialMessageTaskRows, MessageTaskDialog } from './message-task-dialog'

const candidates = [
  { title: '見出し行', isListItem: false, taskId: null },
  { title: '資料を確認する', isListItem: true, taskId: null },
  { title: '日程を調整する', isListItem: true, taskId: 'task-1' },
  { title: '会場を押さえる', isListItem: true, taskId: null },
]

describe('initialMessageTaskRows', () => {
  it('未作成のリスト項目をすべて選択する', () => {
    expect(initialMessageTaskRows(candidates).map(row => row.selected)).toEqual([false, true, false, true])
  })

  it('リスト項目が無ければ未作成の先頭1件だけ選択する', () => {
    const rows = initialMessageTaskRows([
      { title: '済み', isListItem: false, taskId: 'task-1' },
      { title: 'a', isListItem: false, taskId: null },
      { title: 'b', isListItem: false, taskId: null },
    ])
    expect(rows.map(row => row.selected)).toEqual([false, true, false])
  })
})

describe('MessageTaskDialog', () => {
  it('選択した行の件数をボタンに出し、作成済みの行は選択も編集もできない', () => {
    render(<MessageTaskDialog candidates={candidates} onSubmit={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: '2件をタスクにする' })).toBeEnabled()
    expect(screen.getByText('タスク化済み')).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[2]).toBeDisabled()
    expect(screen.getAllByRole('textbox')[2]).toHaveAttribute('readonly')
  })

  it('編集したタイトルで選択行だけを送信し、成功したら閉じる', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<MessageTaskDialog candidates={candidates} onSubmit={onSubmit} onClose={onClose} />)

    const inputs = screen.getAllByRole('textbox')
    await user.clear(inputs[1]!)
    await user.type(inputs[1]!, '  資料を最終確認する ')
    await user.click(screen.getAllByRole('checkbox')[3]!)
    await user.click(screen.getByRole('button', { name: '1件をタスクにする' }))

    // line は候補の行のまま、title だけが編集後になる
    expect(onSubmit).toHaveBeenCalledWith([{ line: '資料を確認する', title: '資料を最終確認する' }])
    expect(onClose).toHaveBeenCalled()
  })

  it('失敗したらダイアログを開いたままにする', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MessageTaskDialog candidates={candidates} onSubmit={vi.fn().mockResolvedValue(false)} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '2件をタスクにする' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('選択行のタイトルが空なら送信できない', async () => {
    const user = userEvent.setup()
    render(<MessageTaskDialog candidates={candidates} onSubmit={vi.fn()} onClose={vi.fn()} />)

    await user.clear(screen.getAllByRole('textbox')[1]!)

    expect(screen.getByRole('button', { name: '2件をタスクにする' })).toBeDisabled()
  })
})
