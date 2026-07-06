// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireProjectAccess,
  mockGetWorkspaceMemberRole,
  mockGetGuestVisibleProjectIds,
  mockDbSelect,
} =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockDbSelect: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: () => ({ success: true, data: { projectId: PROJECT_ID, title: 'task', priority: 'medium' } }) },
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  tasks: {
    id: 'tasks.id',
    projectId: 'tasks.projectId',
    title: 'tasks.title',
    status: 'tasks.status',
    priority: 'tasks.priority',
    dueDate: 'tasks.dueDate',
    createdAt: 'tasks.createdAt',
    sourceMessageId: 'tasks.sourceMessageId',
    assigneeId: 'tasks.assigneeId',
  },
  projects: {
    id: 'projects.id',
    title: 'projects.title',
    workspaceId: 'projects.workspaceId',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
    avatarUrl: 'workspaceMembers.avatarUrl',
  },
}))

function createAwaitableBuilder<T>(rows: T[]) {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  return builder
}

function postRequest() {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, title: 'task', priority: 'medium' }),
  })
}

describe('POST /api/tasks のゲストアクセス制御', () => {
  beforeEach(() => {
    mockDbSelect.mockReset()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('参加外プロジェクトへのタスク作成は 403 で拒否される', async () => {
    mockRequireProjectAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(postRequest())
    expect(res.status).toBe(403)
    expect(mockRequireProjectAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, PROJECT_ID)
  })
})

describe('GET /api/tasks のページネーション', () => {
  beforeEach(() => {
    mockDbSelect.mockReset()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
    mockGetGuestVisibleProjectIds.mockResolvedValue([])
  })

  afterEach(() => vi.clearAllMocks())

  it('不正な cursor を 400 で拒否する', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/tasks?limit=50&cursor=broken'))
    expect(res.status).toBe(400)
  })

  it('limit 指定時は tasks と nextCursor を返す', async () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z')
    const projectBuilder = createAwaitableBuilder([{ id: PROJECT_ID, title: 'Alpha' }])
    const taskBuilder = createAwaitableBuilder([
      {
        id: 'task-2',
        projectId: PROJECT_ID,
        title: '2件目',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        createdAt,
        sourceMessageId: null,
        assigneeName: null,
        assigneeAvatarUrl: null,
      },
      {
        id: 'task-1',
        projectId: PROJECT_ID,
        title: '1件目',
        status: 'done',
        priority: 'low',
        dueDate: null,
        createdAt,
        sourceMessageId: 'msg-1',
        assigneeName: 'Kei',
        assigneeAvatarUrl: null,
      },
    ])
    mockDbSelect
      .mockReturnValueOnce(projectBuilder)
      .mockReturnValueOnce(taskBuilder)

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/tasks?limit=1'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      tasks: [
        {
          id: 'task-2',
          projectId: PROJECT_ID,
          projectTitle: 'Alpha',
          title: '2件目',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assigneeName: null,
          assigneeAvatarUrl: null,
          isLinkedToMessage: false,
        },
      ],
      nextCursor: '2026-07-01T00:00:00.000Z__task-2',
    })
    expect(taskBuilder.limit).toHaveBeenCalledWith(2)
  })
})
