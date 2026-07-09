// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'
const ASSIGNEE_ID = '00000000-0000-0000-0000-000000000099'

const {
  mockGetAuthContext,
  mockRequireProjectAccess,
  mockGetWorkspaceMemberRole,
  mockGetGuestVisibleProjectIds,
  mockInngestSend,
  mockDb,
  mockTaskPayload,
} =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockInngestSend: vi.fn(),
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
    },
    mockTaskPayload: {
      projectId: '30000000-0000-0000-0000-000000000001',
      title: 'task',
      priority: 'medium',
    } as Record<string, unknown>,
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: () => ({ success: true, data: mockTaskPayload }) },
}))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'display-name-sql'),
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  tasks: {},
  projects: { title: 'projects.title', id: 'projects.id' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    membershipStatus: 'wm.membershipStatus',
    displayName: 'wm.displayName',
    avatarUrl: 'wm.avatarUrl',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
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
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockTaskPayload['projectId'] = PROJECT_ID
    mockTaskPayload['title'] = 'task'
    mockTaskPayload['priority'] = 'medium'
    delete mockTaskPayload['assigneeId']
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('参加外プロジェクトへのタスク作成は 403 で拒否される', async () => {
    mockRequireProjectAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(postRequest())
    expect(res.status).toBe(403)
    expect(mockRequireProjectAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, PROJECT_ID)
  })

  it('inactive な assignee には task/assigned を送らない', async () => {
    mockTaskPayload['assigneeId'] = ASSIGNEE_ID
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: '指定されたユーザーはアクティブなワークスペースメンバーではありません',
    })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
