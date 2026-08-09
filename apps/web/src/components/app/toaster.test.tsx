// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Toaster } from './toaster'
import { __resetToastsForTest, toast } from '@/lib/toast'

describe('Toaster', () => {
  afterEach(() => {
    __resetToastsForTest()
  })

  it('テーマ変数が適用される背景付きのトーストを表示する', () => {
    render(<Toaster />)

    act(() => {
      toast.success('コピーしました', { duration: 0 })
    })

    const status = screen.getByRole('status')
    expect(status.parentElement).toHaveClass('app-root')
    expect(status.getAttribute('style')).toContain('background: var(--card)')
    expect(screen.getByText('コピーしました').getAttribute('style')).toContain('color: var(--text)')
  })
})
