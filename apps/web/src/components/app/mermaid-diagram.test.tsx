// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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
})
