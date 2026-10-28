// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MermaidDiagram } from './mermaid-diagram'

const initializeMock = vi.fn()
const renderMock = vi.fn()
const accent = vi.hoisted(() => ({ id: 'emerald' }))

vi.mock('@/components/accent-color-provider', () => ({
  useAccentColor: () => ({ accentId: accent.id }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}))

describe('Mermaid図', () => {
  beforeEach(() => {
    accent.id = 'emerald'
    initializeMock.mockReset()
    renderMock.mockReset()
  })

  it('安全な設定と現在のテーマで図を描画する', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><text>工程</text></svg>' })

    render(<MermaidDiagram definition={'flowchart LR\nA --> B'} />)

    expect(screen.getByRole('status')).toHaveTextContent('図を描画しています...')
    expect(await screen.findByRole('img', { name: 'Mermaid図' })).toHaveTextContent('工程')
    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: expect.objectContaining({ darkMode: true }),
      }),
    )
    expect(renderMock).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-/),
      'flowchart LR\nA --> B',
    )
  })

  it('構文エラー時はソースを確認できるエラーを表示する', async () => {
    renderMock.mockRejectedValue(new Error('Parse error'))

    render(<MermaidDiagram definition="not a diagram" />)

    await waitFor(() => expect(screen.getByText('Mermaid図を表示できません')).toBeInTheDocument())
    expect(screen.getByText('ソースを確認')).toBeInTheDocument()
    expect(screen.getByText('not a diagram')).toBeInTheDocument()
  })

  it('アクセントカラーが変わると図を再描画する', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><text>工程</text></svg>' })
    const { rerender } = render(<MermaidDiagram definition="flowchart LR\nA --> B" />)
    await screen.findByRole('img', { name: 'Mermaid図' })

    accent.id = 'violet'
    rerender(<MermaidDiagram definition="flowchart LR\nA --> B" />)

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2))
  })

  it('全画面ボタンで図を大きく表示し、Escape で閉じる', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><text>工程</text></svg>' })
    const user = userEvent.setup()
    render(<MermaidDiagram definition="flowchart LR\nA --> B" />)

    await user.click(await screen.findByRole('button', { name: '図を全画面で表示' }))
    const dialog = screen.getByRole('dialog', { name: 'Mermaid図' })
    expect(within(dialog).getByRole('img', { name: 'Mermaid図' })).toHaveTextContent('工程')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('描画に失敗したときは全画面ボタンを出さない', async () => {
    renderMock.mockRejectedValue(new Error('Parse error'))
    render(<MermaidDiagram definition="not a diagram" />)

    await screen.findByText('Mermaid図を表示できません')
    expect(screen.queryByRole('button', { name: '図を全画面で表示' })).toBeNull()
  })
})
