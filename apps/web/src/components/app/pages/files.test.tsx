// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageFiles } from './files'
import type { FileDto } from '@/app/api/files/route'

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: fetchWithAuthMock,
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

const FILES_FIXTURE: FileDto[] = [
  {
    id: 'file-1',
    fileName: 'notes.txt',
    mimeType: 'text/markdown',
    fileSize: 24,
    fileType: 'file',
    uploaderName: '山田 太郎',
    uploaderAvatarUrl: null,
    createdAt: '2026-06-29T09:00:00Z',
    indexingStatus: 'indexed',
    projectTitle: '登山計画',
    channelName: null,
    projectId: null,
  },
]

function createIntersectionObserverStub() {
  return class IntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
}

function renderPageFiles() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PageFiles />
    </QueryClientProvider>,
  )
}

describe('ファイル一覧ページ', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset()
    fetchWithAuthMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/files') {
        return {
          ok: true,
          json: async () => FILES_FIXTURE,
        }
      }
      if (url === '/api/attachments/file-1') {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { fileName: string }
          return {
            ok: true,
            json: async () => ({ success: true, fileName: body.fileName }),
          }
        }
        return {
          ok: true,
          text: async () => '# 見出し\n- Markdownとしては解釈しない',
        }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    vi.stubGlobal('IntersectionObserver', createIntersectionObserverStub())
  })

  it('txtファイルをプレーンテキストとしてプレビューする', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByText('notes.txt'))

    const dialog = await screen.findByLabelText('notes.txt のプレビュー')
    expect(dialog).toBeInTheDocument()
    expect(dialog.querySelector('pre')?.textContent).toBe('# 見出し\n- Markdownとしては解釈しない')
    expect(screen.queryByRole('heading', { name: '見出し' })).toBeNull()
  })

  it('操作メニューからファイル名をインライン変更する', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByTitle('操作'))
    await userEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const input = screen.getByRole('textbox', { name: 'ファイル名を変更' })
    await userEvent.clear(input)
    await userEvent.type(input, 'minutes.txt{enter}')

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/attachments/file-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ fileName: 'minutes.txt' }),
      }),
    ))
    expect(await screen.findByText('minutes.txt')).toBeInTheDocument()
  })
})
