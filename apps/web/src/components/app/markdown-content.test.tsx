// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './markdown-content'

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

  it('外部リンクは新しいタブで開く', () => {
    render(<MarkdownContent content={'[外部サイト](https://example.com/docs)'} />)

    expect(screen.getByRole('link', { name: '外部サイト' })).toHaveAttribute('target', '_blank')
  })
})
