// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'
const TASK_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockNudgeSet,
  mockRequireChannelAccess,
  mockSelectLimit,
  mockTaskReturning,
  mockToggleCheckboxAt,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockNudgeSet: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockTaskReturning: vi.fn(),
  mockToggleCheckboxAt: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/chat/checkboxes', () => ({ toggleCheckboxAt: mockToggleCheckboxAt }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
}))
vi.mock('@cairn/db', () => {
  const messages = {
    id: 'messages.id',
    content: 'messages.content',
    channelId: 'messages.channelId',
    deletedAt: 'messages.deletedAt',
  }
  const tasks = {
    id: 'tasks.id',
    sourceMessageId: 'tasks.sourceMessageId',
    sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
  }
  const aiNudges = {
    workspaceId: 'aiNudges.workspaceId',
    taskId: 'aiNudges.taskId',
    status: 'aiNudges.status',
  }
  const db = {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: mockSelectLimit }) }),
    })),
    update: vi.fn((table: unknown) => ({
      set:
        table === tasks
          ? () => ({ where: () => ({ returning: mockTaskReturning }) })
          : table === aiNudges
            ? mockNudgeSet
            : () => ({ where: vi.fn() }),
    })),
  }
  mockNudgeSet.mockReturnValue({ where: vi.fn() })
  return { aiNudges, db, messages, tasks }
})

describe('PATCH /api/messages/[messageId]/checkbox', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectLimit.mockResolvedValue([{ content: '- [ ] task', channelId: 'channel-1' }])
    mockToggleCheckboxAt.mockReturnValue('- [x] task')
  })

  afterEach(() => vi.clearAllMocks())

  it('チェック完了で紐づくactiveナッジもresolvedにする', async () => {
    mockTaskReturning.mockResolvedValue([{ id: TASK_ID }])

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: 0, checked: true }),
    }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })

    expect(response.status).toBe(200)
    expect(mockNudgeSet).toHaveBeenCalledWith({ status: 'resolved', remindAfter: null })
  })

  it('チェック解除ではナッジを解消しない', async () => {
    mockToggleCheckboxAt.mockReturnValue('- [ ] task')
    mockSelectLimit.mockResolvedValue([{ content: '- [x] task', channelId: 'channel-1' }])
    mockTaskReturning.mockResolvedValue([{ id: TASK_ID }])

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/messages/${MESSAGE_ID}/checkbox`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: 0, checked: false }),
    }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })

    expect(response.status).toBe(200)
    expect(mockNudgeSet).not.toHaveBeenCalled()
  })
})
