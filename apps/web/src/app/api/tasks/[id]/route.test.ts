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
  mockRequireChannelAccess,
  mockRequireRole,
  mockIsAssignableTaskMember,
  mockNotifyTaskAssigned,
  mockHasTaskChannelSchema,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbDeleteReturning: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbUpdateSet: vi.fn(),
  mockRequireProjectAccess: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockRequireRole: vi.fn(),
  mockIsAssignableTaskMember: vi.fn(),
  mockNotifyTaskAssigned: vi.fn(),
  mockHasTaskChannelSchema: vi.fn(async () => true),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/chat/checkboxes', () => ({
  toggleCheckboxAt: vi.fn((content: string) => content),
  replaceCheckboxLabelAt: vi.fn((_content: string, _index: number, label: string) => `- [ ] ${label}`),
}))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  requireChannelAccess: mockRequireChannelAccess,
  requireRole: mockRequireRole,
}))
vi.mock('@/lib/tasks/assignment-notification', () => ({
  isAssignableTaskMember: mockIsAssignableTaskMember,
  notifyTaskAssigned: mockNotifyTaskAssigned,
}))
vi.mock('@/lib/tasks/schema-readiness', () => ({ hasTaskChannelSchema: mockHasTaskChannelSchema }))
vi.mock('@cairn/shared', async () => {
  const actual = await vi.importActual<typeof import('@cairn/shared')>('@cairn/shared')
  return actual
})
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  sql: vi.fn(() => 'sql'),
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
      channelId: 'tasks.channelId',
      title: 'tasks.title',
      priority: 'tasks.priority',
      dueDate: 'tasks.dueDate',
      status: 'tasks.status',
      assigneeId: 'tasks.assigneeId',
      sourceMessageId: 'tasks.sourceMessageId',
      sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
    },
    projects: { id: 'projects.id', title: 'projects.title', workspaceId: 'projects.workspaceId' },
    messages: { id: 'messages.id', content: 'messages.content', channelId: 'messages.channelId', senderId: 'messages.senderId' },
    channels: { id: 'channels.id', name: 'channels.name', workspaceId: 'channels.workspaceId', isPrivate: 'channels.isPrivate' },
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
    mockRequireChannelAccess.mockResolvedValue(null)
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
    mockRequireChannelAccess.mockResolvedValue(null)
    mockRequireRole.mockReturnValue(null)
    mockIsAssignableTaskMember.mockResolvedValue(true)
  })

  afterEach(() => vi.clearAllMocks())

  it('migration待機中の通常チャンネルタスクは更新せず503を返す', async () => {
    mockHasTaskChannelSchema.mockResolvedValueOnce(false)
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: null,
      channelId: null,
      projectTitle: null,
      channelName: null,
      title: '保留中タスク',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: 'message-1',
      sourceCheckboxIndex: 0,
    }])

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '更新しない' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: TASK_ID }) })

    expect(res.status).toBe(503)
    expect(mockDbUpdateReturning).not.toHaveBeenCalled()
  })

  it('非公開チャンネルへアクセスできない利用者の更新は403で拒否する', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: null,
      channelId: 'private-channel',
      projectTitle: null,
      title: '非公開タスク',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])
    mockRequireChannelAccess.mockResolvedValue(
      NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 }),
    )

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '見えてはいけない更新' }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: TASK_ID }) })

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID,
      DEV_USER_ID,
      'private-channel',
      'member',
    )
    expect(mockDbUpdateReturning).not.toHaveBeenCalled()
  })

  it('チャンネルタスクの担当者通知にはチャンネル名を含める', async () => {
    const assigneeId = '00000000-0000-0000-0000-0000000000aa'
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: null,
      channelId: 'channel-1',
      projectTitle: null,
      channelName: '折り紙',
      title: 'バックアップを取る',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])
    mockDbUpdateReturning.mockResolvedValue([{
      id: TASK_ID,
      title: 'バックアップを取る',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId,
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: TASK_ID }) })

    expect(res.status).toBe(200)
    expect(mockNotifyTaskAssigned).toHaveBeenCalledWith(expect.objectContaining({
      assigneeId,
      projectId: null,
      scopeTitle: '折り紙',
    }))
  })

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
      // メッセージ逆同期用の select（本人が投稿者なので senderId は自分）
      .mockResolvedValueOnce([{ content: '- [ ] 古いタイトル', channelId: 'c1', senderId: DEV_USER_ID, isPrivate: false }])
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
    // 投稿者本人なので元メッセージのチェックボックス文言も書き換わる
    expect(mockDbUpdateSet).toHaveBeenCalledWith({ content: '- [ ] 新しいタイトル' })
  })

  it('投稿者以外がタイトルを変更しても、元メッセージのチェックボックス文言は書き換えない', async () => {
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
      // メッセージの投稿者は別ユーザー（本人ではない）
      .mockResolvedValueOnce([{ content: '- [ ] 古いタイトル', channelId: 'c1', senderId: 'other-user', isPrivate: false }])
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
    // タスク自体は更新されるが、メッセージ本文の書き換え（content の set）は発生しない
    expect(mockDbUpdateSet).not.toHaveBeenCalledWith(expect.objectContaining({ content: expect.anything() }))
  })

  it('担当者が非活性化しても、同じ担当者のままのタイトル編集は422にならない', async () => {
    // 既存担当者が後から非活性化 → isAssignableTaskMember は false を返す
    mockIsAssignableTaskMember.mockResolvedValue(false)
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: 'project-1',
      projectTitle: 'proj',
      title: '古いタイトル',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: '00000000-0000-0000-0000-0000000000aa',
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])
    mockDbUpdateReturning.mockResolvedValue([{
      id: TASK_ID,
      title: '新しいタイトル',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: '00000000-0000-0000-0000-0000000000aa',
      sourceMessageId: null,
      sourceCheckboxIndex: null,
    }])

    const { PATCH } = await import('./route')
    // assigneeId は既存と同じ値を送る（UIが変更していない担当者も送るケース）
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '新しいタイトル', assigneeId: '00000000-0000-0000-0000-0000000000aa' }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ id: TASK_ID }),
    })

    expect(res.status).toBe(200)
    // 担当者が変わっていないので検証（isAssignableTaskMember）は呼ばれない
    expect(mockIsAssignableTaskMember).not.toHaveBeenCalled()
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
