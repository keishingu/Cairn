// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FilesTab } from './files-tab'
import { AttachmentUploadError, uploadAttachment } from '@/lib/attachments/upload-client'

// 送信の手順（URL 発行 → Storage → 登録）は upload-client.test.ts で確かめる。ここでは画面の振る舞いだけを見る
vi.mock('@/lib/attachments/upload-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/attachments/upload-client')>()),
  uploadAttachment: vi.fn(),
}))
const heic2anyMock = vi.hoisted(() => vi.fn())
vi.mock('heic2any', () => ({ default: heic2anyMock }))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: toastMocks }))
vi.mock('@/hooks/use-project-files', () => ({
  useProjectFiles: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    deleteMutation: { mutateAsync: vi.fn() },
    setLatestMutation: { mutate: vi.fn() },
  })),
}))

const mockUpload = vi.mocked(uploadAttachment)
const uploaded = { fileId: 'f1', fileName: 'guide.pdf', mimeType: 'application/pdf', fileSize: 8 }

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
    mockUpload.mockReset()
    toastMocks.success.mockReset()
  })

  it('複数選択で一部だけ失敗したら、成功件数をトーストし失敗をすべて残す', async () => {
    mockUpload
      .mockResolvedValueOnce(uploaded)
      .mockRejectedValueOnce(new AttachmentUploadError('prepare', 'a.zip は対応していない形式です'))
      .mockRejectedValueOnce(new AttachmentUploadError('prepare', 'b.zip は対応していない形式です'))
    renderFilesTab()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [
      new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' }),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      new File(['y'], 'b.pdf', { type: 'application/pdf' }),
    ])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('a.pdf: a.zip は対応していない形式です')
    expect(alert).toHaveTextContent('b.pdf: b.zip は対応していない形式です')
    expect(toastMocks.success).toHaveBeenCalledWith('ファイルを 1 件追加しました')
  })

  it('HEIC の変換に失敗したら、ライブラリの内部メッセージではなく JPEG への変換を案内する', async () => {
    heic2anyMock.mockRejectedValueOnce(new Error('ERR_LIBHEIF format not supported'))
    renderFilesTab()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['heic'], 'IMG_0001.heic', { type: 'image/heic' })] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('IMG_0001.heic: HEIC 画像を変換できませんでした。JPEG に変換してからアップロードしてください')
    expect(alert).not.toHaveTextContent('ERR_LIBHEIF')
    expect(mockUpload).not.toHaveBeenCalled()
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
    mockUpload.mockResolvedValue(uploaded)
    const { queryClient } = renderFilesTab()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(screen.getByRole('button', { name: 'ファイルを追加' })).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    const file = new File(['%PDF-1.4'], 'guide.pdf', { type: 'application/pdf' })
    await userEvent.upload(input!, file)

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('channel-1', file))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-files', 'project-1'] }))
  })

  it('一部失敗しても成功したアップロードぶんは一覧を再取得する', async () => {
    mockUpload
      .mockResolvedValueOnce(uploaded)
      .mockRejectedValueOnce(new AttachmentUploadError('finalize', 'big.zip は大きすぎます'))

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

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['project-files', 'project-1'] }))
    expect(screen.getByText('big.md: big.zip は大きすぎます')).toBeInTheDocument()
  })

  it('選択直後に input が空になっても、失敗したファイル名を示す', async () => {
    mockUpload.mockRejectedValue(new AttachmentUploadError('storage'))
    renderFilesTab()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [new File(['x'], 'report.pdf', { type: 'application/pdf' })])

    expect(await screen.findByRole('alert')).toHaveTextContent('report.pdf: アップロードに失敗しました')
  })

  it('対応していない形式は、形式の案内を表示する', async () => {
    mockUpload.mockRejectedValue(new AttachmentUploadError('unsupported_type'))
    renderFilesTab()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'archive.zip', { type: 'application/zip' })] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('archive.zip: 対応していないファイル形式です')
  })
})
