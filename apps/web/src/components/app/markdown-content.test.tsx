// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './markdown-content'

describe('MarkdownContent', () => {
  it('見出し、リスト、リンクをMarkdownとして表示する', () => {
    render(<MarkdownContent content={'### 検出したリスク\n\n- 期限超過\n\n[プロジェクトを開く](/projects?open=project-1)'} />)

    expect(screen.getByRole('heading', { level: 3, name: '検出したリスク' })).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveTextContent('期限超過')
    expect(screen.getByRole('link', { name: 'プロジェクトを開く' })).toHaveAttribute('href', '/projects?open=project-1')
  })
})
