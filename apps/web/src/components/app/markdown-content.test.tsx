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

  describe('タスク化した行の行末ラベル', () => {
    const lineTask = (id: string, lineIndex: number | null, status: 'todo' | 'done' = 'todo') => ({ id, status, lineIndex })

    it('見出し・引用・太字で終わる行にも行末に出す', () => {
      render(<MarkdownContent content={'## 見出し\n> 引用\n**太字**'} lineTasks={[lineTask('a', 0), lineTask('b', 1), lineTask('c', 2)]} />)
      const labels = screen.getAllByTestId('line-task-label')
      expect(labels).toHaveLength(3)
      expect(labels[0]!.closest('h2')).toHaveTextContent('見出し')
      expect(labels[1]!.closest('blockquote')).toHaveTextContent('引用')
      expect(labels[2]!.closest('p')).toHaveTextContent('太字')
    })

    it('同じ段落の途中の行にも、その行の末尾に出す', () => {
      render(<MarkdownContent content={'1行目\n2行目\n3行目'} lineTasks={[lineTask('a', 1)]} />)
      const label = screen.getByTestId('line-task-label')
      expect(label.previousSibling?.textContent).toBe('2行目 ')
      expect(label.nextSibling?.nodeName).toBe('BR')
    })

    it('URL で終わる行でもラベルを URL のリンクに巻き込まない', () => {
      render(<MarkdownContent content={'https://example.com/a'} lineTasks={[lineTask('a', 0)]} />)
      expect(screen.getByRole('link', { name: 'https://example.com/a' })).toHaveAttribute('href', 'https://example.com/a')
      expect(screen.getByTestId('line-task-label')).toHaveAttribute('href', '/tasks?taskId=a')
    })

    it('コードブロックと表の行には出さない', () => {
      render(<MarkdownContent content={'```\ncode\n```\n| a | b |\n| - | - |\n| 1 | 2 |\n\n通常'} lineTasks={[lineTask('a', 1), lineTask('b', 3), lineTask('c', 5), lineTask('d', 7)]} />)
      expect(screen.getAllByTestId('line-task-label')).toHaveLength(1)
      expect(screen.getByTestId('line-task-label')).toHaveAttribute('href', '/tasks?taskId=d')
      expect(screen.getByText('code')).toBeInTheDocument()
    })

    it('lineTasks が無いか lineIndex が null なら何も出さない', () => {
      render(<MarkdownContent content={'あ\nい'} lineTasks={[lineTask('a', null)]} />)
      expect(screen.queryByTestId('line-task-label')).toBeNull()
    })

    it('本文に書かれた目印用の文字は偽装できない', () => {
      render(<MarkdownContent content={'偽装\uE0000\uE001'} lineTasks={[lineTask('a', null)]} />)
      expect(screen.queryByTestId('line-task-label')).toBeNull()
    })
  })
})
