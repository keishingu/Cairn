// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'
const PROJECT_ID_2 = '30000000-0000-0000-0000-000000000002'

const {
  mockGetAuthContext,
  mockRequireProjectAccess,
  mockGetWorkspaceMemberRole,
  mockGetGuestVisibleProjectIds,
  mockDbSelectWhere,
  mockDbSelectLimit,
} =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockDbSelectWhere: vi.fn(),
    mockDbSelectLimit: vi.fn(),
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
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  and: vi.fn((...parts) => parts.filter(Boolean)),
  or: vi.fn(() => 'or'),
  lt: vi.fn(() => 'lt'),
  desc: vi.fn(() => 'desc'),
  sql: vi.fn(() => 'sql'),
}))
vi.mock('@cairn/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          then: (resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
            Promise.resolve(mockDbSelectWhere()).then(resolve, reject),
        }),
        leftJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: mockDbSelectLimit,
              }),
            }),
          }),
        }),
      }),
    })),
  },
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
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'workspace_members.userId',
    workspaceId: 'workspace_members.workspaceId',
    displayName: 'workspace_members.displayName',
    avatarUrl: 'workspace_members.avatarUrl',
  },
}))

function postRequest() {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, title: 'task', priority: 'medium' }),
  })
}

function getRequest(search = '') {
  return new Request(`http://localhost/api/tasks${search}`)
}

describe('POST /api/tasks のゲストアクセス制御', () => {
  beforeEach(() => {
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
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
    mockDbSelectWhere
      .mockReturnValueOnce([
        { id: PROJECT_ID, title: 'Alpha' },
        { id: PROJECT_ID_2, title: 'Beta' },
      ])
  })

  afterEach(() => vi.clearAllMocks())

  it('limit 件で打ち切り nextCursor を返す', async () => {
    mockDbSelectLimit.mockResolvedValue([
      {
        id: 't3',
        projectId: PROJECT_ID,
        title: 'Task 3',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        createdAt: new Date('2026-07-09T09:00:00.000Z'),
        sourceMessageId: null,
        assigneeName: null,
        assigneeAvatarUrl: null,
      },
      {
        id: 't2',
        projectId: PROJECT_ID_2,
        title: 'Task 2',
        status: 'done',
        priority: 'low',
        dueDate: null,
        createdAt: new Date('2026-07-09T08:00:00.000Z'),
        sourceMessageId: null,
        assigneeName: 'Bob',
        assigneeAvatarUrl: null,
      },
      {
        id: 't1',
        projectId: PROJECT_ID,
        title: 'Task 1',
        status: 'todo',
        priority: 'high',
        dueDate: null,
        createdAt: new Date('2026-07-09T07:00:00.000Z'),
        sourceMessageId: 'm1',
        assigneeName: null,
        assigneeAvatarUrl: null,
      },
    ])

    const { GET } = await import('./route')
    const res = await GET(getRequest('?limit=2'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 't3',
          projectId: PROJECT_ID,
          projectTitle: 'Alpha',
          title: 'Task 3',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assigneeName: null,
          assigneeAvatarUrl: null,
          isLinkedToMessage: false,
        },
        {
          id: 't2',
          projectId: PROJECT_ID_2,
          projectTitle: 'Beta',
          title: 'Task 2',
          status: 'done',
          priority: 'low',
          dueDate: null,
          assigneeName: 'Bob',
          assigneeAvatarUrl: null,
          isLinkedToMessage: false,
        },
      ],
      nextCursor: '2026-07-09T08:00:00.000Z::t2',
    })
    expect(mockDbSelectLimit).toHaveBeenCalledWith(3)
  })

  it('不正な cursor は 400 で拒否する', async () => {
    const { GET } = await import('./route')
    const res = await GET(getRequest('?cursor=broken'))
    expect(res.status).toBe(400)
  })
})
