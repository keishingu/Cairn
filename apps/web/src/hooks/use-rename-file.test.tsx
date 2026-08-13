// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRenameFile } from './use-rename-file'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockFetchWithAuth = vi.mocked(fetchWithAuth)

describe('useRenameFile', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, fileName: 'renamed.pdf' }),
    } as Response)
  })

  it('チャットのメッセージキャッシュにある添付ファイル名も更新する', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['messages', 'channel-1'], [{
      id: 'message-1',
      content: '',
      messageType: 'text',
      senderId: 'user-1',
      senderName: '山田 太郎',
      senderAvatarUrl: null,
      createdAt: '2026-08-07T03:45:00.000Z',
      isEdited: false,
      reactions: [],
      attachments: [{
        id: 'attachment-1', fileId: 'file-1', fileName: 'before.pdf',
        mimeType: 'application/pdf', fileSize: 1024, displayOrder: 0,
      }],
      parentMessageId: null,
      replyTo: null,
      bookmarked: false,
    }])
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useRenameFile(), { wrapper })

    await act(() => result.current.mutateAsync({ fileId: 'file-1', fileName: 'renamed.pdf' }))

    expect(queryClient.getQueryData<Array<{ attachments: Array<{ fileName: string }> }>>(
      ['messages', 'channel-1'],
    )?.[0]?.attachments[0]?.fileName).toBe('renamed.pdf')
  })
})
