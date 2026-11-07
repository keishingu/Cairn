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
  mockBuildMentionNameMap,
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
  mockBuildMentionNameMap: vi.fn(async () => new Map<string, string>()),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
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
vi.mock('@/lib/chat/mention-name-map', () => ({ buildMentionNameMap: mockBuildMentionNameMap }))
vi.mock('@cairn/shared', async () => {
  const actual = await vi.importActual<typeof import('@cairn/shared')>('@cairn/shared')
  return actual
})
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  sql: vi.fn(() => 'sql'),
  isNull: vi.fn(() => 'isNull'),
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
      description: 'tasks.description',
      createdBy: 'tasks.createdBy',
      createdAt: 'tasks.createdAt',
    },
    profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
    workspaceMembers: {
      userId: 'workspaceMembers.userId',
      workspaceId: 'workspaceMembers.workspaceId',
      displayName: 'workspaceMembers.displayName',
      avatarUrl: 'workspaceMembers.avatarUrl',
    },
    projects: { id: 'projects.id', title: 'projects.title', workspaceId: 'projects.workspaceId' },
    messages: {
      id: 'messages.id',
      content: 'messages.content',
      channelId: 'messages.channelId',
      senderId: 'messages.senderId',
      createdAt: 'messages.createdAt',
      deletedAt: 'messages.deletedAt',
    },
    channels: {
      id: 'channels.id',
      name: 'channels.name',
      type: 'channels.type',
      workspaceId: 'channels.workspaceId',
      isPrivate: 'channels.isPrivate',
    },
    channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
    aiNudges: {
      workspaceId: 'aiNudges.workspaceId',
      taskId: 'aiNudges.taskId',
      status: 'aiNudges.status',
    },
  }
})

const MESSAGE_ID = '30000000-0000-0000-0000-000000000001'

function taskDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    projectId: 'project-1',
    projectTitle: 'Alpha',
    channelId: 'channel-1',
    channelName: '全体',
    channelType: 'project',
    channelIsPrivate: false,
    title: 'レビュー対応',
    description: '## 手順\n1. 確認する',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    assigneeId: null,
    assigneeName: null,
    assigneeAvatarUrl: null,
    sourceMessageId: null,
    createdBy: DEV_USER_ID,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  }
}

function getRequest() {
  return new Request(`http://localhost/api/tasks/${TASK_ID}`)
}

describe('GET /api/tasks/[id]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockRequireRole.mockReturnValue(null)
    mockHasTaskChannelSchema.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockDbSelectLimit.mockReset()
  })

  it('自ワークスペースに無いタスクは404を返す', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([])
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(404)
  })

  it('チャンネルにアクセスできない利用者には403を返し、本文を返さない', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([taskDetailRow({ channelId: 'private-channel', description: '秘密' })])
    mockRequireChannelAccess.mockResolvedValue(
      NextResponse.json({ error: 'このチャンネルにアクセスする権限がありません' }, { status: 403 }),
    )
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, 'private-channel', 'member')
    expect(JSON.stringify(await res.json())).not.toContain('秘密')
  })

  it('チャンネルなしのプロジェクトタスクは、プロジェクトにアクセスできなければ403を返す', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([taskDetailRow({ channelId: null })])
    mockRequireProjectAccess.mockResolvedValue(
      NextResponse.json({ error: 'このプロジェクトにアクセスする権限がありません' }, { status: 403 }),
    )
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(403)
    expect(mockRequireProjectAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, 'project-1', 'member')
  })

  it('プロジェクト・チャンネル未所属のタスクは member 未満なら403を返す', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([taskDetailRow({ projectId: null, channelId: null })])
    mockRequireRole.mockReturnValue(NextResponse.json({ error: 'メンバー以上の権限が必要です' }, { status: 403 }))
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(403)
    expect(mockRequireRole).toHaveBeenCalledWith('member', 'member')
  })

  it('出典メッセージのないタスクは説明・作成情報を返し sourceMessage は null', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([taskDetailRow()])
      .mockResolvedValueOnce([{ name: '山田 太郎' }])
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: TASK_ID,
      title: 'レビュー対応',
      description: '## 手順\n1. 確認する',
      hasDescription: true,
      isLinkedToMessage: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      createdByName: '山田 太郎',
      sourceMessage: null,
    })
  })

  it('説明が未入力なら hasDescription は false', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([taskDetailRow({ description: null })])
      .mockResolvedValueOnce([{ name: '山田 太郎' }])
    const { GET } = await import('./route')
    const body = await (await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })).json()
    expect(body).toMatchObject({ description: null, hasDescription: false })
  })

  it('出典メッセージがあれば、メンションを表示名に解決した本文と送信者を返す', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([taskDetailRow({ sourceMessageId: MESSAGE_ID })])
      .mockResolvedValueOnce([{ name: '山田 太郎' }])
      .mockResolvedValueOnce([{
        id: MESSAGE_ID,
        channelId: 'channel-1',
        content: '<@user-2> これお願いします',
        senderName: '佐藤 花子',
        senderAvatarUrl: 'https://example.com/a.png',
        createdAt: new Date('2026-08-31T09:00:00.000Z'),
      }])
    mockBuildMentionNameMap.mockResolvedValueOnce(new Map([['user-2', '鈴木 次郎']]))
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      isLinkedToMessage: true,
      sourceMessage: {
        id: MESSAGE_ID,
        channelId: 'channel-1',
        content: '<@user-2|鈴木 次郎> これお願いします',
        senderName: '佐藤 花子',
        senderAvatarUrl: 'https://example.com/a.png',
        createdAt: '2026-08-31T09:00:00.000Z',
      },
    })
    expect(mockBuildMentionNameMap).toHaveBeenCalledWith(DEV_WORKSPACE_ID, ['<@user-2> これお願いします'])
  })

  it('出典メッセージが削除済みなら sourceMessage は null で、リンク済みの印は残す', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([taskDetailRow({ sourceMessageId: MESSAGE_ID })])
      .mockResolvedValueOnce([{ name: '山田 太郎' }])
      .mockResolvedValueOnce([])
    const { GET } = await import('./route')
    const body = await (await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })).json()
    expect(body).toMatchObject({ isLinkedToMessage: true, sourceMessage: null })
  })

  it('出典メッセージが別チャンネルで閲覧できない場合は本文を返さず null にする', async () => {
    mockDbSelectLimit
      .mockResolvedValueOnce([taskDetailRow({ sourceMessageId: MESSAGE_ID })])
      .mockResolvedValueOnce([{ name: '山田 太郎' }])
      .mockResolvedValueOnce([{
        id: MESSAGE_ID,
        channelId: 'other-private-channel',
        content: '非公開の本文',
        senderName: '佐藤 花子',
        senderAvatarUrl: null,
        createdAt: new Date('2026-08-31T09:00:00.000Z'),
      }])
    mockRequireChannelAccess
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sourceMessage).toBeNull()
    expect(JSON.stringify(body)).not.toContain('非公開の本文')
  })

  it('migration待機中の通常チャンネルタスクは503を返す', async () => {
    mockHasTaskChannelSchema.mockResolvedValueOnce(false)
    mockDbSelectLimit.mockResolvedValueOnce([taskDetailRow({ projectId: null, channelId: null, sourceMessageId: MESSAGE_ID })])
    const { GET } = await import('./route')
    const res = await GET(getRequest(), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(503)
  })
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

  it('チャット由来タスクも単体で削除できる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: TASK_ID, projectId: 'project-1', sourceMessageId: 'm1' }])
    mockDbDeleteReturning.mockResolvedValue([{ id: TASK_ID }])
    const { DELETE } = await import('./route')
    const res = await DELETE(new Request(`http://localhost/api/tasks/${TASK_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TASK_ID }),
    })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: TASK_ID })
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

  it('チャット由来タスクのタイトル変更は元メッセージ本文を書き換えない', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: TASK_ID,
      projectId: 'project-1',
      projectTitle: 'proj',
      title: '古いタイトル',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: 'm1',
      sourceCheckboxIndex: null,
    }])
    mockDbUpdateReturning.mockResolvedValue([{
      id: TASK_ID,
      title: '新しいタイトル',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      assigneeId: null,
      sourceMessageId: 'm1',
      sourceCheckboxIndex: null,
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

  it('説明を更新でき、空文字は null として保存する', async () => {
    mockDbSelectLimit.mockResolvedValue([{
      id: TASK_ID, projectId: 'project-1', channelId: null, projectTitle: 'Alpha', title: 't',
      priority: 'medium', dueDate: null, status: 'todo', assigneeId: null, sourceMessageId: null,
    }])
    mockDbUpdateReturning.mockResolvedValue([{ id: TASK_ID, title: 't', description: '詳細', status: 'todo' }])
    const { PATCH } = await import('./route')

    const first = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '詳細' }),
    }), { params: Promise.resolve({ id: TASK_ID }) })
    expect(first.status).toBe(200)
    expect(mockDbUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ description: '詳細' }))

    const second = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '' }),
    }), { params: Promise.resolve({ id: TASK_ID }) })
    expect(second.status).toBe(200)
    expect(mockDbUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ description: null }))
  })

  it('10000文字を超える説明は422で拒否する', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request(`http://localhost/api/tasks/${TASK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'あ'.repeat(10001) }),
    }), { params: Promise.resolve({ id: TASK_ID }) })
    expect(res.status).toBe(422)
  })
})
