// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  DEV_USER_ID,
  OTHER_USER_ID,
  DEV_WORKSPACE_ID,
  mockGetAuthContext,
  mockDb,
  mockGetWorkspaceMemberRole,
  mockRemove,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => {
  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
  const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
  const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: DEV_USER_ID,
      workspaceId: DEV_WORKSPACE_ID,
    },
    error: null,
  })
  const mockDb = { select: vi.fn(), update: vi.fn() }
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('admin')
  const mockRemove = vi.fn().mockResolvedValue({ error: null })
  const mockCreateServiceRoleClient = vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        remove: mockRemove,
      })),
    },
  }))
  return {
    DEV_USER_ID,
    OTHER_USER_ID,
    DEV_WORKSPACE_ID,
    mockGetAuthContext,
    mockDb,
    mockGetWorkspaceMemberRole,
    mockRemove,
    mockCreateServiceRoleClient,
  }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  isWorkspaceAdmin: (role: string | null) => role === 'owner' || role === 'admin',
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
    bio: 'profiles.bio',
    icalToken: 'profiles.icalToken',
    updatedAt: 'profiles.updatedAt',
  },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    avatarUrl: 'wm.avatarUrl',
    displayName: 'wm.displayName',
    membershipStatus: 'wm.membershipStatus',
    deactivatedAt: 'wm.deactivatedAt',
    deactivatedBy: 'wm.deactivatedBy',
    status: 'wm.status',
    statusMessage: 'wm.statusMessage',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
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

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }
}

function postRequest(targetUserId: string) {
  return new Request(`http://localhost/api/workspaces/members/${targetUserId}/anonymize`, {
    method: 'POST',
  })
}

describe('POST /api/workspaces/members/[userId]/anonymize', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockRemove.mockResolvedValue({ error: null })
  })

  it('未認証なら 401 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(401)
  })

  it('member は匿名化できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('member')

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('対象メンバーがいなければ 404 を返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(404)
  })

  it('アバターも含めて匿名化する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID }]))
    mockDb.select.mockReturnValueOnce(selectChain([
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-2.png' },
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-2/user-2.webp' },
      { avatarUrl: null },
    ]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(['ws-1/user-2.png', 'ws-2/user-2.webp'])
    const body = await res.json() as { anonymized: boolean }
    expect(body.anonymized).toBe(true)
  })

  it('アバター削除に失敗したら 500 を返し、DBは更新しない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID }]))
    mockDb.select.mockReturnValueOnce(selectChain([
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-2.png' },
    ]))
    mockRemove.mockResolvedValueOnce({ error: { message: 'boom' } })

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(500)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
