// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'
const BOT_USER_ID = '40000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds, mockCreateTaskSafeParse, mockDb } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockCreateTaskSafeParse: vi.fn(),
    mockDb: {
      select: vi.fn(),
    },
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
  db: mockDb,
  tasks: {},
  projects: {},
  profiles: { id: 'profiles.id', kind: 'profiles.kind' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId' },
  activeWorkspaceMembers: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  inArray: vi.fn(() => 'inArray'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'limit']) {
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

  it('bot profile を assigneeId に指定すると 422 を返す', async () => {
    mockRequireProjectAccess.mockResolvedValue(null)
    mockCreateTaskSafeParse.mockReturnValue({
      success: true,
      data: { projectId: PROJECT_ID, title: 'task', priority: 'medium', assigneeId: BOT_USER_ID },
    })
    mockDb.select.mockReturnValueOnce(chain([]))

    const { POST } = await import('./route')
    const res = await POST(postRequest())

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'assigneeId must be a human workspace member' })
  })
})
