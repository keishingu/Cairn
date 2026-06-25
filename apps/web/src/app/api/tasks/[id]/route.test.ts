// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const TASK_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDbSelectLimit,
  mockDbDeleteReturning,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbDeleteReturning: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/chat/checkboxes', () => ({ toggleCheckboxAt: vi.fn() }))
vi.mock('@cairn/shared', async () => {
  const actual = await vi.importActual<typeof import('@cairn/shared')>('@cairn/shared')
  return actual
})
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))
vi.mock('@cairn/db', () => {
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: mockDbSelectLimit,
          }),
        }),
      }),
    })),
    delete: vi.fn(() => ({
      where: () => ({
        returning: mockDbDeleteReturning,
      }),
    })),
  }
  return {
    db,
    tasks: {
      id: 'tasks.id',
      projectId: 'tasks.projectId',
      title: 'tasks.title',
      priority: 'tasks.priority',
      dueDate: 'tasks.dueDate',
      status: 'tasks.status',
      sourceMessageId: 'tasks.sourceMessageId',
      sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
    },
    projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  }
})

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('チャット由来タスクの削除は 409 で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, sourceMessageId: 'm1' }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(409)
  })

  it('手動タスクは削除できる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, sourceMessageId: null }])
    mockDbDeleteReturning.mockResolvedValue([{ id: TASK_ID }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: TASK_ID })
  })
})
