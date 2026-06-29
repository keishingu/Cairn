// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FilesTab } from './files-tab'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth')
vi.mock('@/hooks/use-project-files', () => ({
  useProjectFiles: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    deleteMutation: { mutateAsync: vi.fn() },
    setLatestMutation: { mutate: vi.fn() },
  })),
}))

const mockFetch = vi.mocked(fetchWithAuth)

function renderFilesTab(channelId: string | null = 'channel-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FilesTab projectId="project-1" channelId={channelId} />
      </QueryClientProvider>,
    ),
  }
}

describe('ファイルタブ', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('detail panel から PDF をアップロードできる', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ fileId: 'f1' }), { status: 201 }))
    const { queryClient } = renderFilesTab()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(screen.getByRole('button', { name: 'ファイルを追加' })).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    const file = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' })
    await userEvent.upload(input!, file)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/attachments/upload',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    ))

    const [, requestInit] = mockFetch.mock.calls[0]!
    const formData = requestInit?.body as FormData
    expect(formData.get('channelId')).toBe('channel-1')
    expect(formData.get('file')).toBe(file)

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-files', 'project-1'] }))
  })

  it('一部失敗しても成功したアップロードぶんは一覧を再取得する', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ fileId: 'f1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'big.zip は大きすぎます' }), { status: 400 }))

    const { queryClient } = renderFilesTab()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()

    await userEvent.upload(
      input!,
      [
        new File(['ok'], 'ok.txt', { type: 'text/plain' }),
        new File(['ng'], 'big.md', { type: 'text/markdown' }),
      ],
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-files', 'project-1'] }))
    expect(screen.getByText('big.zip は大きすぎます')).toBeInTheDocument()
  })
})
