// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(status.closest('.app-root')).not.toBeNull()
    expect(status.getAttribute('style')).toContain('background: var(--card)')
    expect(screen.getByText('コピーしました').getAttribute('style')).toContain('color: var(--text)')
  })

  it('エラーは role="alert" で読み上げを優先させる', () => {
    render(<Toaster />)

    act(() => {
      toast.error('保存できませんでした', { duration: 0 })
    })

    expect(screen.getByRole('alert')).toHaveTextContent('保存できませんでした')
  })

  it('閉じたトーストは退場アニメーションの後に DOM から外れる', () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)

      let id = 0
      act(() => {
        id = toast.success('削除しました', { duration: 0 })
      })
      act(() => {
        toast.dismiss(id)
      })

      expect(screen.getByText('削除しました').closest('[data-leaving]')).not.toBeNull()

      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(screen.queryByText('削除しました')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('上部配置ではセーフエリアを考慮して上端に表示する', () => {
    render(<Toaster placement="top" />)

    act(() => {
      toast.info('お知らせ', { duration: 0 })
    })

    const container = screen.getByRole('status').closest('.app-toaster')
    expect(container).toHaveAttribute('data-placement', 'top')
    expect(container?.getAttribute('style')).toContain('safe-area-inset-top')
  })

  it('連続して出しても退場中の行を含めて3件までしか描画しない', () => {
    render(<Toaster />)

    act(() => {
      for (let i = 1; i <= 6; i++) toast.info(`通知${i}`, { duration: 0 })
    })

    expect(document.querySelectorAll('.app-toast')).toHaveLength(3)
    expect(screen.getByText('通知6')).toBeInTheDocument()
  })

  it('フォーカスが残っている間はホバーを外しても自動で消えない', () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)
      act(() => { toast.success('保存しました') })

      const row = screen.getByRole('status')
      fireEvent.mouseEnter(row)
      fireEvent.focus(screen.getByRole('button', { name: '閉じる' }))
      fireEvent.mouseLeave(row)
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(screen.getByText('保存しました')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
