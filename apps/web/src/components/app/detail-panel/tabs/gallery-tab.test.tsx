// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { GalleryTab } from './gallery-tab'

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(async () => ({
    ok: true,
    json: async () => [],
  })),
}))

vi.mock('@/lib/process-image', () => ({
  processImageForUpload: vi.fn(),
}))

function renderGalleryTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <GalleryTab projectId="project-1" />
    </QueryClientProvider>,
  )
}

describe('GalleryTab', () => {
  it('写真を追加ボタンに追加アイコンを表示する', async () => {
    const { container } = renderGalleryTab()
    const button = await screen.findByRole('button', { name: '写真を追加' })

    expect(button).toBeInTheDocument()
    expect(container.querySelectorAll('button svg line')).toHaveLength(2)
  })
})
