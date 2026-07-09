// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds, mockDb, mockInngestSend } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockDb: { select: vi.fn(), insert: vi.fn() },
    mockInngestSend: vi.fn(),
  }))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/shared', () => ({
  createTaskSchema: { safeParse: (body: unknown) => ({ success: true, data: body as { projectId: string; title: string; priority: string; assigneeId?: string } }) },
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  tasks: {},
  projects: { title: 'projects.title', id: 'projects.id' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    membershipStatus: 'wm.membershipStatus',
    displayName: 'wm.displayName',
    avatarUrl: 'wm.avatarUrl',
  },
}))

function selectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
    }),
  }
}

function postRequest(body: Record<string, unknown> = { projectId: PROJECT_ID, title: 'task', priority: 'medium' }) {
  return new Request('http://localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

  it('非活性メンバーを担当者に指定すると 422 を返す', async () => {
    mockRequireProjectAccess.mockResolvedValue(null)
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipStatus: 'inactive' }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest({
      projectId: PROJECT_ID,
      title: 'task',
      priority: 'medium',
      assigneeId: '00000000-0000-0000-0000-000000000099',
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '非活性メンバーは担当者に設定できません' })
  })
})
