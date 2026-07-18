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
  mockRequireRole,
  mockIsActiveWorkspaceMember,
  mockNotifyTaskAssigned,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbDeleteReturning: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbUpdateSet: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
  mockRequireRole: vi.fn(),
  mockIsActiveWorkspaceMember: vi.fn(),
  mockNotifyTaskAssigned: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/chat/checkboxes', () => ({ toggleCheckboxAt: vi.fn(), replaceCheckboxLabelAt: vi.fn() }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  requireRole: mockRequireRole,
}))
vi.mock('@/lib/tasks/assignment-notification', () => ({
  isActiveWorkspaceMember: mockIsActiveWorkspaceMember,
  notifyTaskAssigned: mockNotifyTaskAssigned,
}))
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
  // from/leftJoin/innerJoin/where をすべて自身に返し、limit で結果を解決する簡易チェーン
  const selectChain = {
    from: () => selectChain,
    leftJoin: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: mockDbSelectLimit,
  }
  const dbCore = {
    select: vi.fn(() => selectChain),
    delete: vi.fn(() => ({
      where: () => ({
        returning: mockDbDeleteReturning,
      }),
    })),
    update: vi.fn(() => ({
      set: mockDbUpdateSet,
    })),
  }
  const db = {
    ...dbCore,
    transaction: vi.fn(async (callback: (tx: typeof dbCore) => Promise<unknown>) => callback(dbCore)),
  }
  return {
    db,
    tasks: {
      id: 'tasks.id',
      workspaceId: 'tasks.workspaceId',
      projectId: 'tasks.projectId',
      title: 'tasks.title',
      priority: 'tasks.priority',
      dueDate: 'tasks.dueDate',
      status: 'tasks.status',
      assigneeId: 'tasks.assigneeId',
      sourceMessageId: 'tasks.sourceMessageId',
      sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
    },
    projects: { id: 'projects.id', title: 'projects.title', workspaceId: 'projects.workspaceId' },
    messages: { id: 'messages.id', content: 'messages.content', channelId: 'messages.channelId' },
    channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', isPrivate: 'channels.isPrivate' },
    channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
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
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireRole.mockReturnValue(null)
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
    const { aiNudges, db } = await import('@cairn/db')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: TASK_ID })
    expect(db.update).toHaveBeenCalledWith(aiNudges)
    expect(mockDbUpdateSet).toHaveBeenCalledWith({ status: 'resolved', remindAfter: null })
  })

  it('プロジェクト未所属の手動タスクも member なら削除できる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, projectId: null, sourceMessageId: null }])
    mockDbDeleteReturning.mockResolvedValue([{ id: TASK_ID }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(200)
    expect(mockRequireRole).toHaveBeenCalled()
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
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireRole.mockReturnValue(null)
    mockIsActiveWorkspaceMember.mockResolvedValue(true)
  })

  afterEach(() => vi.clearAllMocks())

  it('参加外プロジェクトの手動タスク更新は 403 で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValue([{
      id: TASK_ID,
      projectId: 'project-2',
      projectTitle: 'proj',
      title: 'title',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
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

  it('チャット由来タスクのタイトル変更も許可される', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([{
        id: TASK_ID,
        projectId: 'project-1',
        projectTitle: 'proj',
        title: '古いタイトル',
        priority: 'medium',
        dueDate: null,
        status: 'todo',
        assigneeId: null,
        sourceMessageId: 'm1',
        sourceCheckboxIndex: 0,
      }])
      // メッセージ逆同期用の select（プライベート判定）
      .mockResolvedValueOnce([{ content: '- [ ] 古いタイトル', channelId: 'c1', isPrivate: false }])
    mockDbUpdateReturning.mockResolvedValue([{
      id: TASK_ID,
      title: '新しいタイトル',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: 'm1',
      sourceCheckboxIndex: 0,
    }])

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '新しいタイトル' }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ id: TASK_ID }),
    })

    expect(res.status).toBe(200)
    expect(mockDbUpdateReturning).toHaveBeenCalled()
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
