// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireChannelAccess, mockHasTaskChannelSchema, mockEq, mockDb } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireChannelAccess: vi.fn(),
    mockHasTaskChannelSchema: vi.fn(async () => true),
    mockEq: vi.fn(() => 'eq'),
    mockDb: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/tasks/schema-readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tasks/schema-readiness')>()),
  hasTaskChannelSchema: mockHasTaskChannelSchema,
}))
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
    sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
  },
}))

describe('PATCH /api/messages/[messageId]', () => {
  afterEach(() => vi.clearAllMocks())

  it('メッセージ更新とタスク同期を同じtransactionで失敗させる', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-id', workspaceId: 'workspace-id', role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [
              {
                id: 'message-id',
                content: 'before',
                channelId: 'channel-id',
                projectId: null,
                channelType: 'workspace',
              },
            ],
          }),
        }),
      }),
    })

    const tx = {
      select: vi.fn(() => ({
        from: () => ({ where: async () => [] }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: 'message-id', content: '- [ ] task' }],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => {
          throw new Error('task insert failed')
        }),
      })),
      delete: vi.fn(),
    }
    let committed = false
    mockDb.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx)
      committed = true
      return result
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

    expect(response.status).toBe(500)
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(tx.update).toHaveBeenCalledOnce()
    expect(tx.insert).toHaveBeenCalledOnce()
    expect(committed).toBe(false)
  })

  it('並べ替えたチェックボックスを既存task IDへ再対応させる', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-id', workspaceId: 'workspace-id', role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDb.select.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [{
              id: 'message-id',
              content: '- [ ] A\n- [x] B',
              channelId: 'channel-id',
              projectId: null,
              channelType: 'workspace',
            }],
          }),
        }),
      }),
    })

    const taskUpdates: Array<Record<string, unknown>> = []
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [
            { id: 'task-a', sourceCheckboxIndex: 0 },
            { id: 'task-b', sourceCheckboxIndex: 1 },
          ],
        }),
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => {
          if ('content' in values) {
            return {
              where: () => ({
                returning: async () => [{ id: 'message-id', content: '- [x] B\n- [ ] A' }],
              }),
            }
          }
          taskUpdates.push(values)
          return { where: async () => undefined }
        },
      })),
      insert: vi.fn(),
      delete: vi.fn(),
    }
    mockDb.transaction.mockImplementation(callback => callback(tx))

    const { PATCH } = await import('./route')
    const response = await PATCH(
      new Request('http://localhost/api/messages/message-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '- [x] B\n- [ ] A' }),
      }),
      { params: Promise.resolve({ messageId: 'message-id' }) },
    )

    expect(response.status).toBe(200)
    expect(taskUpdates).toEqual([
      expect.objectContaining({ sourceCheckboxIndex: 0, title: 'B', status: 'done' }),
      expect.objectContaining({ sourceCheckboxIndex: 1, title: 'A', status: 'todo' }),
    ])
    expect(mockEq).toHaveBeenCalledWith('tasks.id', 'task-b')
    expect(mockEq).toHaveBeenCalledWith('tasks.id', 'task-a')
  })
})
