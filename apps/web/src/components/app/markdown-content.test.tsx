// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownContent } from './markdown-content'

vi.mock('./mermaid-diagram', () => ({
  MermaidDiagram: ({ definition }: { definition: string }) => <div role="img" aria-label="Mermaid図">{definition}</div>,
}))

describe('Markdownコンテンツ', () => {
  it('見出し、リスト、リンクをMarkdownとして表示する', () => {
    render(<MarkdownContent content={'### 検出したリスク\n\n- 期限超過\n\n[プロジェクトを開く](/projects?open=project-1)'} />)

    expect(screen.getByRole('heading', { level: 3, name: '検出したリスク' })).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveTextContent('期限超過')
    expect(screen.getByRole('link', { name: 'プロジェクトを開く' })).toHaveAttribute('href', '/projects?open=project-1')
    expect(screen.getByRole('link', { name: 'プロジェクトを開く' })).not.toHaveAttribute('target')
  })

  it('生の内部パスはURLを隠したリンクとして表示する', () => {
    render(<MarkdownContent content={'根拠: タスクA /tasks?taskId=task-1）\n\n[/projects?open=project-1](/projects?open=project-1)'} />)

    const taskLink = screen.getByRole('link', { name: 'タスクを開く' })
    expect(taskLink).toHaveAttribute('href', '/tasks?taskId=task-1')
    expect(taskLink).not.toHaveTextContent('/tasks')
    expect(taskLink).not.toHaveAttribute('target')
    expect(screen.getByText(/）$/)).toBeInTheDocument()

    const projectLink = screen.getByRole('link', { name: 'プロジェクトを開く' })
    expect(projectLink).toHaveAttribute('href', '/projects?open=project-1')
    expect(projectLink).not.toHaveTextContent('/projects')
  })

  it('未対応の内部パスは一部だけをリンク化しない', () => {
    render(<MarkdownContent content={'/projects/archive/readme'} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('/projects/archive/readme')).toBeInTheDocument()
  })

  it('外部リンクは新しいタブで開く', () => {
    render(<MarkdownContent content={'[外部サイト](https://example.com/docs) [プロトコル相対URL](//example.com/docs)'} />)

    expect(screen.getByRole('link', { name: '外部サイト' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'プロトコル相対URL' })).toHaveAttribute('target', '_blank')
  })

  it('mermaidコードブロックを図として表示する', () => {
    render(<MarkdownContent content={'```mermaid\nflowchart LR\n  A --> B\n```'} />)

    expect(screen.getByRole('img', { name: 'Mermaid図' })).toHaveTextContent('flowchart LR')
    expect(screen.getByRole('img', { name: 'Mermaid図' })).toHaveTextContent('A --> B')
    expect(screen.queryByText('flowchart LR', { selector: 'code' })).not.toBeInTheDocument()
  })

  it('通常のコードブロックはコードのまま表示する', () => {
    const { container } = render(<MarkdownContent content={'```typescript\nconst answer = 42\n```'} />)

    expect(container.querySelector('pre code.language-typescript')).toHaveTextContent('const answer = 42')
    expect(screen.queryByRole('img', { name: 'Mermaid図' })).not.toBeInTheDocument()
  })

  it('表を罫線とセル余白つきで表示する', () => {
    render(<MarkdownContent content={'| ロール | 作成 |\n|:---|---:|\n| owner | ○ |'} />)

    const table = screen.getByRole('table')
    expect(table).toHaveStyle({ borderCollapse: 'collapse' })
    expect(table.parentElement).toHaveStyle({ overflowX: 'auto' })
    expect(screen.getByRole('columnheader', { name: 'ロール' })).toHaveStyle({
      border: '1px solid var(--border-2)',
      padding: '6px 10px',
    })
    expect(screen.getByRole('cell', { name: 'owner' })).toHaveStyle({
      border: '1px solid var(--border-2)',
      padding: '6px 10px',
    })
    expect(screen.getByRole('columnheader', { name: '作成' })).toHaveStyle({ textAlign: 'right' })
    expect(screen.getByRole('cell', { name: '○' })).toHaveStyle({ textAlign: 'right' })
  })
})
