// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatTab } from './chat-tab'

const { mockUseProjectChannels, mockFindProjectChannelById } = vi.hoisted(() => ({
  mockUseProjectChannels: vi.fn(),
  mockFindProjectChannelById: vi.fn(),
}))

vi.mock('@/lib/chat/client', () => ({
  chatQueryKeys: {
    messages: (channelId: string | null) => ['messages', channelId],
  },
  useProjectChannels: mockUseProjectChannels,
  findProjectChannelById: mockFindProjectChannelById,
}))

vi.mock('../../chat-thread', () => ({
  ChatThread: () => <div>chat-thread</div>,
}))

function renderChatTab(isActive: boolean, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatTab
        project={{ id: 'project-1', memberCount: 3 } as React.ComponentProps<typeof ChatTab>['project']}
        isActive={isActive}
      />
    </QueryClientProvider>,
  )
}

describe('ChatTab', () => {
  beforeEach(() => {
    mockUseProjectChannels.mockReturnValue({
      data: [{ channelId: 'channel-1', projectId: 'project-1', projectTitle: 'Project 1' }],
      isLoading: false,
      isError: false,
    })
    mockFindProjectChannelById.mockReturnValue({
      channelId: 'channel-1',
      projectTitle: 'Project 1',
    })
  })

  it('非アクティブから復帰したときにメッセージを再取得する', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const view = renderChatTab(false, queryClient)

    expect(invalidateSpy).not.toHaveBeenCalled()

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatTab
          project={{ id: 'project-1', memberCount: 3 } as React.ComponentProps<typeof ChatTab>['project']}
          isActive
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'channel-1'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['channel-files', 'channel-1'] })
    })
  })
})
