// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const TASK_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDbSelectLimit,
  mockDbDeleteReturning,
  mockDbUpdateReturning,
  mockDbUpdateSet,
  mockRequireProjectAccess,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbDeleteReturning: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbUpdateSet: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/chat/checkboxes', () => ({ toggleCheckboxAt: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ requireProjectAccess: mockRequireProjectAccess }))
vi.mock('@cairn/shared', async () => {
  const actual = await vi.importActual<typeof import('@cairn/shared')>('@cairn/shared')
  return actual
})
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))
vi.mock('@cairn/db', () => {
  mockDbUpdateSet.mockImplementation(() => ({
    where: () => ({ returning: mockDbUpdateReturning }),
  }))
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
    update: vi.fn(() => ({
      set: mockDbUpdateSet,
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
    aiNudges: {
      workspaceId: 'aiNudges.workspaceId',
      taskId: 'aiNudges.taskId',
      status: 'aiNudges.status',
    },
  }
})

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
  })

  afterEach(() => vi.clearAllMocks())

  it('チャット由来タスクの削除は 409 で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, projectId: 'project-1', sourceMessageId: 'm1' }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(409)
  })

  it('手動タスクは削除できる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, projectId: 'project-1', sourceMessageId: null }])
    mockDbDeleteReturning.mockResolvedValue([{ id: TASK_ID }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: TASK_ID })
  })

  it('参加外プロジェクトの手動タスク削除は 403 で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, projectId: 'project-2', sourceMessageId: null }])
    mockRequireProjectAccess.mockResolvedValue(
      NextResponse.json({ error: 'このプロジェクトにアクセスする権限がありません' }, { status: 403 }),
    )

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
  })

  afterEach(() => vi.clearAllMocks())

  it('参加外プロジェクトの手動タスク更新は 403 で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValue([{
      id: TASK_ID,
      projectId: 'project-2',
      title: 'title',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])
    mockRequireProjectAccess.mockResolvedValue(
      NextResponse.json({ error: 'このプロジェクトにアクセスする権限がありません' }, { status: 403 }),
    )

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'updated' }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ id: TASK_ID }),
    })

    expect(res.status).toBe(403)
    expect(mockDbUpdateReturning).not.toHaveBeenCalled()
  })

  it('タスク完了時は全操作経路で紐づくactiveナッジをresolvedにする', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: 'project-1',
      title: 'title',
      priority: 'medium',
      dueDate: null,
      status: 'in_progress',
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])
    mockDbUpdateReturning.mockResolvedValueOnce([{
      id: TASK_ID,
      title: 'title',
      priority: 'medium',
      dueDate: null,
      status: 'done',
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])

    const { PATCH } = await import('./route')
    const { aiNudges, db } = await import('@cairn/db')
    const response = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }), { params: Promise.resolve({ id: TASK_ID }) })

    expect(response.status).toBe(200)
    expect(db.update).toHaveBeenCalledWith(aiNudges)
    expect(mockDbUpdateSet).toHaveBeenCalledWith({ status: 'resolved', remindAfter: null })
  })
})
