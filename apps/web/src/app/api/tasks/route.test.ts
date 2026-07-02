// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
  }))
const { mockIsActiveWorkspaceMember, mockInngestSend } = vi.hoisted(() => ({
  mockIsActiveWorkspaceMember: vi.fn(),
  mockInngestSend: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@/lib/inngest/notification-access', () => ({ isActiveWorkspaceMember: mockIsActiveWorkspaceMember }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: () => ({ success: true, data: { projectId: PROJECT_ID, title: 'task', priority: 'medium' } }) },
}))
vi.mock('@cairn/db', () => ({
  db: {},
  tasks: 'tasks',
  projects: { id: 'projects.id', title: 'projects.title' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: { userId: 'workspaceMembers.userId', avatarUrl: 'workspaceMembers.avatarUrl' },
}))

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
    mockIsActiveWorkspaceMember.mockResolvedValue(true)
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

  it('inactive な assignee には task/assigned を送らない', async () => {
    mockRequireProjectAccess.mockResolvedValue(null)
    mockIsActiveWorkspaceMember.mockResolvedValue(false)

    const returning = vi.fn().mockResolvedValue([{ id: 'task-1', projectId: PROJECT_ID, title: 'task', status: 'todo', priority: 'medium', dueDate: null, assigneeId: 'user-2' }])
    const insertChain = { values: vi.fn().mockReturnValue({ returning }) }
    const selectProjectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ title: 'Project A' }]),
    }
    const selectAssigneeChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ displayName: 'User 2', avatarUrl: null }]),
    }

    const { db } = await import('@cairn/db')
    db.insert = vi.fn().mockReturnValue(insertChain)
    db.select = vi.fn()
      .mockReturnValueOnce(selectProjectChain)
      .mockReturnValueOnce(selectAssigneeChain)

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: PROJECT_ID, title: 'task', priority: 'medium', assigneeId: 'user-2' }),
    }))

    expect(res.status).toBe(201)
    expect(mockIsActiveWorkspaceMember).toHaveBeenCalledWith({
      workspaceId: DEV_WORKSPACE_ID,
      userId: 'user-2',
    })
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
