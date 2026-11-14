// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ATTACHMENT_URL_UNAVAILABLE, SentAttachments, toDisplayAttachments } from './ai-attachments'

describe('送信済みの添付の表示', () => {
  it('リンクを発行できなかった添付は、開けないことを表示してリンクにしない', () => {
    const attachments = toDisplayAttachments([
      { fileName: '予算.pdf', mimeType: 'application/pdf', url: 'https://storage/a' },
      { fileName: '地図.png', mimeType: 'image/png', url: null },
    ])
    expect(attachments[1]?.url).toBe(ATTACHMENT_URL_UNAVAILABLE)

    render(<SentAttachments attachments={attachments}/>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://storage/a')
    expect(screen.getByRole('alert')).toHaveTextContent('リンクを取得できませんでした')
    expect(screen.getByText('地図.png')).toBeInTheDocument()
  })
})
