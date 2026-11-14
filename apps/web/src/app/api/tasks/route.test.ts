// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const PROJECT_ID = '30000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireProjectAccess, mockRequireChannelAccess, mockGetWorkspaceMemberRole, mockGetGuestVisibleProjectIds, mockHasTaskChannelSchema } =
  vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockRequireProjectAccess: vi.fn(),
    mockRequireChannelAccess: vi.fn(),
    mockGetWorkspaceMemberRole: vi.fn(),
    mockGetGuestVisibleProjectIds: vi.fn(),
    mockHasTaskChannelSchema: vi.fn(async () => true),
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
  createTaskSchema: { safeParse: () => ({ success: true, data: { projectId: PROJECT_ID, title: 'task', priority: 'medium' } }) },
}))
vi.mock('@cairn/db', () => ({ db: {} }))

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
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'guest' },
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
