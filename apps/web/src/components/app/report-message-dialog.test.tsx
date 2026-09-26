// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReportMessageDialog } from './report-message-dialog'

describe('ReportMessageDialog', () => {
  it('理由を選ぶまで報告できず、選ぶと理由を渡して閉じる', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<ReportMessageDialog open onSubmit={onSubmit} onClose={onClose} />)

    const submit = screen.getByRole('button', { name: '報告する' })
    expect(submit).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'スパム' }))
    await user.click(submit)

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam' })
    expect(onClose).toHaveBeenCalled()
  })

  it('その他は詳細を入力するまで報告できない', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ReportMessageDialog open onSubmit={onSubmit} onClose={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: 'その他' }))
    const submit = screen.getByRole('button', { name: '報告する' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByRole('textbox'), '  宣伝の連投  ')
    await user.click(submit)

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'other', details: '宣伝の連投' })
  })

  it('送信に失敗したら開いたまま理由を表示する', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ReportMessageDialog
        open
        onSubmit={vi.fn().mockRejectedValue(new Error('報告に失敗しました'))}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'スパム' }))
    await user.click(screen.getByRole('button', { name: '報告する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('報告に失敗しました')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('その他で詳細を入れてから別の理由に変えたら、隠れた詳細は送らない', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ReportMessageDialog open onSubmit={onSubmit} onClose={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: 'その他' }))
    await user.type(screen.getByRole('textbox'), '宣伝の連投')
    await user.click(screen.getByRole('radio', { name: 'スパム' }))
    await user.click(screen.getByRole('button', { name: '報告する' }))

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam' })
  })
})
