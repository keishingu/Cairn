// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsureWorkspaceBotProfile, mockDbInsert, mockDbSelect, mockInngestSend } = vi.hoisted(() => ({
  mockEnsureWorkspaceBotProfile: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbSelect: vi.fn(),
  mockInngestSend: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./bot-profile', () => ({
  ensureWorkspaceBotProfile: mockEnsureWorkspaceBotProfile,
}))

vi.mock('@cairn/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
  },
  channels: {
    id: 'channels.id',
    workspaceId: 'channels.workspaceId',
    projectId: 'channels.projectId',
  },
  messages: {
    id: 'messages.id',
    senderId: 'messages.senderId',
  },
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: mockInngestSend,
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))

function insertChain(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  }
}

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
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
    mockDbSelect.mockReturnValueOnce(selectChain([{ effectiveWorkspaceId: 'workspace-1' }]))
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

  it('別 workspace の channel には bot メッセージを書き込まない', async () => {
    mockDbSelect.mockReturnValueOnce(selectChain([{ effectiveWorkspaceId: 'workspace-2' }]))

    const { postBotMessage } = await import('./bot-message')
    await expect(
      postBotMessage({
        channelId: 'channel-1',
        workspaceId: 'workspace-1',
        content: 'hello from bot',
      }),
    ).rejects.toThrow('Bot message channel does not belong to workspace')

    expect(mockEnsureWorkspaceBotProfile).not.toHaveBeenCalled()
    expect(mockDbInsert).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
