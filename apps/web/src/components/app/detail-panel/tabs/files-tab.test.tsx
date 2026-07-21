// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FilesTab } from './files-tab'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useProjectFiles } from '@/hooks/use-project-files'

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
const mockUseProjectFiles = vi.mocked(useProjectFiles)

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

  it('detail panel の file picker が CSV と pptx を許可する', () => {
    renderFilesTab()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input?.accept).toContain('text/csv')
    expect(input?.accept).toContain('.csv')
    expect(input?.accept).toContain('.pptx')
    expect(input?.accept).toContain('application/vnd.openxmlformats-officedocument.presentationml.presentation')
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

  it('ファイル操作メニューに開く・ダウンロード・削除を表示する', async () => {
    mockUseProjectFiles.mockReturnValue({
      data: [{
        id: 'file-1',
        fileName: 'guide.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        fileType: 'file',
        uploaderName: '山田 太郎',
        uploaderAvatarUrl: null,
        createdAt: '2026-06-29T09:00:00Z',
        indexingStatus: 'indexed',
        isLatest: false,
      }],
      isLoading: false,
      isError: false,
      deleteMutation: { mutateAsync: vi.fn() },
      setLatestMutation: { mutate: vi.fn() },
    } as unknown as ReturnType<typeof useProjectFiles>)

    renderFilesTab()

    await userEvent.click(screen.getByTitle('操作'))

    expect(screen.getByRole('button', { name: '別タブで開く' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ダウンロード' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })
})
