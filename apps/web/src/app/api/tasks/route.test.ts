// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds, mockCreateTaskSafeParse } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockCreateTaskSafeParse: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: mockCreateTaskSafeParse },
}))
vi.mock('@cairn/db', () => ({
  db: { select: vi.fn() },
  tasks: {},
  projects: {},
  profiles: {},
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    membershipStatus: 'wm.membershipStatus',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))

function selectChain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const method of ['from', 'where', 'limit']) {
    c[method] = vi.fn().mockReturnValue(c)
  }
  return c
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
    mockCreateTaskSafeParse.mockReturnValue({
      success: true,
      data: { projectId: PROJECT_ID, title: 'task', priority: 'medium' },
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

  it('非活性ユーザーへのタスク割り当ては 422 で拒否される', async () => {
    const { db } = await import('@cairn/db')
    mockRequireProjectAccess.mockResolvedValue(null)
    mockCreateTaskSafeParse.mockReturnValue({
      success: true,
      data: {
        projectId: PROJECT_ID,
        title: 'task',
        priority: 'medium',
        assigneeId: '00000000-0000-0000-0000-000000000099',
      },
    })
    vi.mocked(db.select).mockReturnValueOnce(selectChain([]) as never)

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '非活性ユーザーにはタスクを割り当てできません' })
  })
})
