// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const NUDGE_ID = '20000000-0000-0000-0000-000000000001'
const TASK_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockRequireProjectAccess,
  mockSelectLimit,
  mockUpdateReturning,
  mockUpdateSet,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockUpdateSet: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
  requireProjectAccess: mockRequireProjectAccess,
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))
vi.mock('@cairn/db', () => ({
  aiNudges: {
    id: 'aiNudges.id',
    workspaceId: 'aiNudges.workspaceId',
    userId: 'aiNudges.userId',
    channelId: 'aiNudges.channelId',
    projectId: 'aiNudges.projectId',
    taskId: 'aiNudges.taskId',
    status: 'aiNudges.status',
  },
  tasks: { id: 'tasks.id', status: 'tasks.status' },
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
      }),
    })),
    update: vi.fn(() => ({ set: mockUpdateSet })),
  },
}))

describe('PATCH /api/ai/nudges/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockRequireProjectAccess.mockResolvedValue(null)
    mockUpdateSet.mockReturnValue({
      where: () => ({ returning: mockUpdateReturning }),
    })
  })

  afterEach(() => vi.clearAllMocks())

  test('完了済みタスクのactiveナッジを即時resolvedにする', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ id: NUDGE_ID, channelId: 'channel-1', projectId: 'project-1', taskId: TASK_ID }])
      .mockResolvedValueOnce([{ status: 'done' }])
    mockUpdateReturning.mockResolvedValue([{ id: NUDGE_ID }])

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/ai/nudges/${NUDGE_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_completed_task' }),
    }), { params: Promise.resolve({ id: NUDGE_ID }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: NUDGE_ID, status: 'resolved' })
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved', remindAfter: null }))
  })

  test('タスクが未完了ならナッジをresolvedにしない', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ id: NUDGE_ID, channelId: null, projectId: 'project-1', taskId: TASK_ID }])
      .mockResolvedValueOnce([{ status: 'in_progress' }])

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/ai/nudges/${NUDGE_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_completed_task' }),
    }), { params: Promise.resolve({ id: NUDGE_ID }) })

    expect(response.status).toBe(409)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  test('既存のあとでフィードバックも引き続き保存できる', async () => {
    mockSelectLimit.mockResolvedValueOnce([{
      id: NUDGE_ID,
      channelId: null,
      projectId: 'project-1',
      taskId: TASK_ID,
    }])
    mockUpdateReturning.mockResolvedValue([{ id: NUDGE_ID }])

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request(`http://localhost/api/ai/nudges/${NUDGE_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback: 'later' }),
    }), { params: Promise.resolve({ id: NUDGE_ID }) })

    expect(response.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'dismissed',
      feedback: 'later',
    }))
  })
})
