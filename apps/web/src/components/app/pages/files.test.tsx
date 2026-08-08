// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageFiles } from './files'
import type { FileDto } from '@/app/api/files/route'

const { fetchWithAuthMock, routerPushMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  routerPushMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

const originalTimeZone = process.env['TZ']

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: fetchWithAuthMock,
}))

vi.mock('@/lib/command-registry', () => ({
  useCommand: vi.fn(),
}))

const FILES_FIXTURE: FileDto[] = [
  {
    id: 'file-1',
    sourceChannelId: 'channel-1',
    sourceMessageId: 'message-1',
    fileName: 'notes.txt',
    mimeType: 'text/markdown',
    fileSize: 24,
    fileType: 'file',
    uploaderId: 'user-1',
    uploaderName: '山田 太郎',
    uploaderAvatarUrl: null,
    createdAt: '2026-06-29T09:00:00Z',
    indexingStatus: 'indexed',
    projectTitle: '登山計画',
    channelName: null,
    projectId: 'project-1',
  },
  {
    id: 'file-2',
    fileName: 'general.pdf',
    mimeType: 'application/pdf',
    fileSize: 48,
    fileType: 'file',
    uploaderId: 'user-2',
    uploaderName: '佐藤 花子',
    uploaderAvatarUrl: null,
    createdAt: '2026-08-07T16:00:00Z',
    projectTitle: null,
    channelName: '雑談',
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
    process.env['TZ'] = 'Asia/Tokyo'
    fetchWithAuthMock.mockReset()
    routerPushMock.mockReset()
    fetchWithAuthMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/files') {
        return {
          ok: true,
          json: async () => FILES_FIXTURE,
        }
      }
      if (url === '/api/files/filters' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string; conditions: unknown }
        return new Response(
          JSON.stringify({
            id: 'filter-1',
            name: body.name,
            conditions: body.conditions,
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-08T00:00:00.000Z',
          }),
          { status: 201 },
        )
      }
      if (url === '/api/files/filters') {
        return new Response('[]', { status: 200 })
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

  afterEach(() => {
    process.env['TZ'] = originalTimeZone
  })

  it('txtファイルをプレーンテキストとしてプレビューする', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByText('notes.txt'))

    const dialog = await screen.findByLabelText('notes.txt のプレビュー')
    expect(dialog).toBeInTheDocument()
    expect(dialog.querySelector('pre')?.textContent).toBe('# 見出し\n- Markdownとしては解釈しない')
    expect(screen.queryByRole('heading', { name: '見出し' })).toBeNull()
  })

  it('ファイルをプロジェクト別のセクションに分ける', async () => {
    renderPageFiles()

    expect(await screen.findByRole('button', { name: /登山計画.*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /プロジェクトなし.*1/ })).toBeInTheDocument()
  })

  it('現在の条件に名前を付けて保存する', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByRole('button', { name: 'フィルター' }))
    await userEvent.selectOptions(screen.getByLabelText('プロジェクト'), 'project-1')
    await userEvent.type(screen.getByLabelText('現在の条件を保存'), '計画書')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/files/filters',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByRole('button', { name: '計画書' })).toBeInTheDocument()
  })

  it('アップロード日時をローカル日付で絞り込む', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByRole('button', { name: 'フィルター' }))
    await userEvent.type(screen.getByLabelText('開始日'), '2026-08-08')

    expect(await screen.findByText('general.pdf')).toBeInTheDocument()
    expect(screen.queryByText('notes.txt')).toBeNull()
  })

  it('操作メニューからファイル名をインライン変更する', async () => {
    renderPageFiles()

    await waitFor(() => expect(screen.getAllByTitle('操作')).toHaveLength(2))
    await userEvent.click(screen.getAllByTitle('操作')[0]!)
    await userEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const input = screen.getByRole('textbox', { name: 'ファイル名を変更' })
    await userEvent.clear(input)
    await userEvent.type(input, 'minutes.txt{enter}')

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/attachments/file-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ fileName: 'minutes.txt' }),
        }),
      ),
    )
    expect(await screen.findByText('minutes.txt')).toBeInTheDocument()
  })

  it('操作メニューから共有元のチャットへ移動する', async () => {
    renderPageFiles()

    await userEvent.click(await screen.findByTitle('操作'))
    await userEvent.click(screen.getByRole('button', { name: 'チャットに移動' }))

    expect(routerPushMock).toHaveBeenCalledWith('/chats/channel-1?m=message-1')
  })
})
