// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './copy-button'

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

describe('CopyButton', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockReset()
    mocks.toastError.mockReset()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('コピーに成功するとボタンがコピー済みになり、2秒後に戻る', async () => {
    writeText.mockResolvedValue(undefined)
    render(<CopyButton text="https://example.com/invite" />)

    await act(async () => { screen.getByRole('button', { name: 'コピー' }).click() })

    expect(writeText).toHaveBeenCalledWith('https://example.com/invite')
    expect(screen.getByRole('button', { name: 'コピー済み' })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByRole('button', { name: 'コピー' })).toBeInTheDocument()
  })

  it('関数で渡すと押した時点の値をコピーする', async () => {
    writeText.mockResolvedValue(undefined)
    let value = 'before'
    const { rerender } = render(<CopyButton text={() => value} />)
    value = 'after'
    rerender(<CopyButton text={() => value} />)

    await act(async () => { screen.getByRole('button', { name: 'コピー' }).click() })

    expect(writeText).toHaveBeenCalledWith('after')
    // 関数は描画ごとに作り直されても、コピー済みの表示を消さない
    expect(screen.getByRole('button', { name: 'コピー済み' })).toBeInTheDocument()
  })

  it('失敗したらトーストで知らせ、コピー済みにしない', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CopyButton text="x" errorMessage="招待リンクをコピーできませんでした" />)

    await act(async () => { screen.getByRole('button', { name: 'コピー' }).click() })

    expect(mocks.toastError).toHaveBeenCalledWith('招待リンクをコピーできませんでした')
    expect(screen.queryByRole('button', { name: 'コピー済み' })).toBeNull()
  })

  it('コピー対象が変わったらコピー済みの表示を戻す', async () => {
    writeText.mockResolvedValue(undefined)
    const { rerender } = render(<CopyButton text="https://example.com/old" />)

    await act(async () => { screen.getByRole('button', { name: 'コピー' }).click() })
    expect(screen.getByRole('button', { name: 'コピー済み' })).toBeInTheDocument()

    rerender(<CopyButton text="https://example.com/new" />)
    expect(screen.getByRole('button', { name: 'コピー' })).toBeInTheDocument()
  })

  it('対象が変わる前に始めた書き込みが後から終わっても、コピー済みにしない', async () => {
    let finish: (() => void) | undefined
    writeText.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    const { rerender } = render(<CopyButton text="https://example.com/old" />)

    act(() => { screen.getByRole('button', { name: 'コピー' }).click() })
    rerender(<CopyButton text="https://example.com/new" />)
    await act(async () => { finish?.() })

    expect(screen.queryByRole('button', { name: 'コピー済み' })).toBeNull()
  })
})
