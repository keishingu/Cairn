// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireChannelAccess, mockEq, mockDb } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireChannelAccess: vi.fn(),
    mockEq: vi.fn(() => 'eq'),
    mockDb: {
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    },
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/chat/mentions', () => ({ canonicalizeMentions: (content: string) => content }))
vi.mock('@cairn/shared', () => ({
  editMessageSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: mockEq,
  and: vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  inArray: vi.fn(() => 'inArray'),
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  messages: {
    id: 'messages.id',
    content: 'messages.content',
    channelId: 'messages.channelId',
    senderId: 'messages.senderId',
    deletedAt: 'messages.deletedAt',
  },
  channels: {
    id: 'channels.id',
    workspaceId: 'channels.workspaceId',
    projectId: 'channels.projectId',
    type: 'channels.type',
  },
  tasks: {
    id: 'tasks.id',
    sourceMessageId: 'tasks.sourceMessageId',
  },
}))

const authContext = {
  ctx: { userId: 'user-id', workspaceId: 'workspace-id', role: 'member' },
  error: null,
}

function mockTargetMessage() {
  mockDb.select.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => [{ id: 'message-id', channelId: 'channel-id' }],
        }),
      }),
    }),
  })
}

describe('PATCH /api/messages/[messageId]', () => {
  afterEach(() => vi.clearAllMocks())

  it('本文チェックボックスを含んでいても本文更新だけを行いタスクには触れない', async () => {
    mockGetAuthContext.mockResolvedValue(authContext)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockTargetMessage()
    const setValues: Array<Record<string, unknown>> = []
    mockDb.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        setValues.push(values)
        return {
          where: () => ({
            returning: async () => [{ id: 'message-id', content: '- [ ] task' }],
          }),
        }
      },
    })

    const { PATCH } = await import('./route')
    const response = await PATCH(
      new Request('http://localhost/api/messages/message-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '- [ ] task' }),
      }),
      { params: Promise.resolve({ messageId: 'message-id' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'message-id', content: '- [ ] task' })
    expect(mockDb.update).toHaveBeenCalledOnce()
    expect(setValues).toEqual([expect.objectContaining({ content: '- [ ] task' })])
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/messages/[messageId]', () => {
  afterEach(() => vi.clearAllMocks())

  it('メッセージの削除と同じトランザクションで、そのメッセージ由来のタスクも削除する', async () => {
    mockGetAuthContext.mockResolvedValue(authContext)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockTargetMessage()
    const deleteWhere = vi.fn(async () => undefined)
    const tx = {
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    }
    mockDb.transaction.mockImplementation(callback => callback(tx))

    const { DELETE } = await import('./route')
    const response = await DELETE(
      new Request('http://localhost/api/messages/message-id', { method: 'DELETE' }),
      { params: Promise.resolve({ messageId: 'message-id' }) },
    )

    expect(response.status).toBe(204)
    expect(tx.update).toHaveBeenCalledOnce()
    expect(tx.delete).toHaveBeenCalledOnce()
    expect(mockEq).toHaveBeenCalledWith('tasks.sourceMessageId', 'message-id')
  })
})
