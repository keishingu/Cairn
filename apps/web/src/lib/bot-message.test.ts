// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsureWorkspaceBotProfile, mockDbInsert, mockInngestSend } = vi.hoisted(() => ({
  mockEnsureWorkspaceBotProfile: vi.fn(),
  mockDbInsert: vi.fn(),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./bot-profile', () => ({
  ensureWorkspaceBotProfile: mockEnsureWorkspaceBotProfile,
}))

vi.mock('@cairn/db', () => ({
  db: {
    insert: mockDbInsert,
  },
  messages: {
    id: 'messages.id',
    senderId: 'messages.senderId',
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

function insertChain(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('postBotMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureWorkspaceBotProfile.mockResolvedValue({
      id: 'bot-1',
      displayName: 'Cairn Bot',
    })
  })

  it('bot 名義でメッセージを保存し message/created を送る', async () => {
    mockDbInsert.mockReturnValueOnce(insertChain([{ id: 'msg-1', senderId: 'bot-1' }]))

    const { postBotMessage } = await import('./bot-message')
    await expect(
      postBotMessage({
        channelId: 'channel-1',
        workspaceId: 'workspace-1',
        content: 'hello from bot',
      }),
    ).resolves.toEqual({
      id: 'msg-1',
      senderId: 'bot-1',
      senderName: 'Cairn Bot',
    })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'message/created',
        data: expect.objectContaining({
          messageId: 'msg-1',
          senderId: 'bot-1',
          senderName: 'Cairn Bot',
        }),
      }),
    )
  })
})
