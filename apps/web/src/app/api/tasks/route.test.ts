// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockRequireChannelAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds, mockHasTaskChannelSchema, mockDbSelectLimit, mockCreateTaskData, mockInsertValues, mockInsertReturning } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockRequireChannelAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockHasTaskChannelSchema: vi.fn(async () => true),
    mockDbSelectLimit: vi.fn(),
    mockInsertValues: vi.fn(),
    mockInsertReturning: vi.fn(),
    mockCreateTaskData: {
      projectId: '30000000-0000-0000-0000-000000000001' as string | null, channelId: null as string | null,
      sourceMessageId: undefined as string | undefined, title: 'task', priority: 'medium',
    },
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  requireChannelAccess: mockRequireChannelAccess,
  requireRole: vi.fn(() => null),
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/tasks/assignment-notification', () => ({
  isAssignableTaskMember: vi.fn(async () => true),
  notifyTaskAssigned: vi.fn(async () => undefined),
}))
vi.mock('@/lib/tasks/schema-readiness', () => ({ hasTaskChannelSchema: mockHasTaskChannelSchema }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: () => ({ success: true, data: mockCreateTaskData }) },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'), and: vi.fn(() => 'and'), inArray: vi.fn(() => 'inArray'), isNull: vi.fn(() => 'isNull'),
}))
vi.mock('@cairn/db', () => {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: mockDbSelectLimit,
  }
  return {
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => ({ values: (values: unknown) => {
        mockInsertValues(values)
        return { returning: mockInsertReturning }
      } })),
    },
    tasks: {}, projects: {}, channels: {}, messages: {}, profiles: {}, workspaceMembers: {},
  }
})

function postRequest() {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, title: 'task', priority: 'medium' }),
  })
}

describe('POST /api/tasks のゲストアクセス制御', () => {
  beforeEach(() => {
    mockCreateTaskData.projectId = PROJECT_ID
    mockCreateTaskData.channelId = null
    mockCreateTaskData.sourceMessageId = undefined
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireChannelAccess.mockResolvedValue(null)
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'guest' },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('共有元の非公開チャンネル権限がない場合はタスクを作成しない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'guest' },
      error: null,
    })
    mockCreateTaskData.projectId = null
    mockCreateTaskData.channelId = null
    mockCreateTaskData.sourceMessageId = '50000000-0000-0000-0000-000000000001'
    mockDbSelectLimit.mockResolvedValue([{
      id: mockCreateTaskData.sourceMessageId,
      channelId: '40000000-0000-0000-0000-000000000001',
      projectId: null,
      channelType: 'workspace',
    }])
    mockRequireChannelAccess.mockResolvedValue(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }))

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID, DEV_USER_ID, '40000000-0000-0000-0000-000000000001', 'guest',
    )
  })

  it('非公開プロジェクトチャンネルの通常メッセージから範囲を引き継いで作成する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' }, error: null,
    })
    const sourceMessageId = '50000000-0000-0000-0000-000000000001'
    const channelId = '40000000-0000-0000-0000-000000000001'
    mockCreateTaskData.projectId = PROJECT_ID
    mockCreateTaskData.channelId = channelId
    mockCreateTaskData.sourceMessageId = sourceMessageId
    mockDbSelectLimit
      .mockResolvedValueOnce([{ id: sourceMessageId, channelId, projectId: PROJECT_ID, channelType: 'project' }])
      .mockResolvedValueOnce([{ title: 'Project' }])
      .mockResolvedValueOnce([{ name: 'private', isPrivate: true, type: 'workspace' }])
    mockInsertReturning.mockResolvedValueOnce([{
      id: '60000000-0000-0000-0000-000000000001', projectId: PROJECT_ID, title: 'task',
      status: 'todo', priority: 'medium', dueDate: null, assigneeId: null,
      sourceMessageId, sourceCheckboxIndex: null,
    }])

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(201)
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: DEV_WORKSPACE_ID, projectId: PROJECT_ID, channelId, sourceMessageId, sourceCheckboxIndex: null,
    }))
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, channelId, 'member')
  })

  it('共有元がDMならタスク作成を拒否する', async () => {
    mockCreateTaskData.projectId = null
    mockCreateTaskData.channelId = null
    mockCreateTaskData.sourceMessageId = '50000000-0000-0000-0000-000000000001'
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: mockCreateTaskData.sourceMessageId, channelId: '40000000-0000-0000-0000-000000000001',
      projectId: null, channelType: 'dm',
    }])

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('作成先の指定が共有元チャンネルと異なる場合は拒否する', async () => {
    mockCreateTaskData.projectId = null
    mockCreateTaskData.channelId = '40000000-0000-0000-0000-000000000099'
    mockCreateTaskData.sourceMessageId = '50000000-0000-0000-0000-000000000001'
    mockDbSelectLimit.mockResolvedValueOnce([{
      id: mockCreateTaskData.sourceMessageId, channelId: '40000000-0000-0000-0000-000000000001',
      projectId: null, channelType: 'workspace',
    }])

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('参加外プロジェクトへのタスク作成は 403 で拒否される', async () => {
    mockRequireProjectAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(postRequest())
    expect(res.status).toBe(403)
    expect(mockRequireProjectAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, PROJECT_ID, 'guest')
  })
})

describe('GET /api/tasks の担当者フィルター', () => {
  afterEach(() => vi.clearAllMocks())

  it('assigneeはme以外を受け付けない', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/tasks?assignee=another-user'))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'assignee must be "me"' })
    expect(mockGetAuthContext).not.toHaveBeenCalled()
  })
})

describe('GET /api/tasks のチャンネルアクセス制御', () => {
  afterEach(() => vi.clearAllMocks())

  it('参加していない非公開チャンネルのタスク一覧は403で拒否する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/tasks?channelId=private-channel'))

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(
      DEV_WORKSPACE_ID,
      DEV_USER_ID,
      'private-channel',
      'member',
    )
  })

  it('migration適用前はチャンネルタスクの取得だけを一時保留する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockHasTaskChannelSchema.mockResolvedValueOnce(false)

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/tasks?channelId=channel'))

    expect(res.status).toBe(503)
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
  })
})
