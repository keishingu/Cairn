// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InlineError } from './inline-error'

describe('InlineError', () => {
  it('role="alert" で本文をそのまま表示する', () => {
    render(<InlineError>保存できませんでした</InlineError>)

    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
    expect(screen.getByText('保存できませんでした')).toBeInTheDocument()
  })

  it('onDismiss を渡すと閉じるボタンを出す', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<InlineError variant="box" onDismiss={onDismiss}>送信できませんでした</InlineError>)

    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
