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
  mockClearWorkspaceCacheForUser,
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
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb)),
  }
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('admin')
  const mockRemove = vi.fn().mockResolvedValue({ error: null })
  const mockClearWorkspaceCacheForUser = vi.fn()
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
    mockClearWorkspaceCacheForUser,
  }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
  clearWorkspaceCacheForUser: mockClearWorkspaceCacheForUser,
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
    role: 'wm.role',
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
  count: vi.fn(() => 'count'),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
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
    mockClearWorkspaceCacheForUser.mockReset()
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
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-2.png' },
      { avatarUrl: null },
    ]))
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(['ws-1/user-2.png'])
    const body = await res.json() as { anonymized: boolean }
    expect(body.anonymized).toBe(true)
  })

  it('アバター削除に失敗したら 500 を返し、DBは更新しない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-2.png' },
    ]))
    mockRemove.mockResolvedValueOnce({ error: { message: 'boom' } })

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(500)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('admin は owner を匿名化できない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('active membership が残る間は profile を匿名化しない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
    const memberUpdate = updateChain()
    const profileUpdate = updateChain()
    mockDb.update
      .mockReturnValueOnce(memberUpdate)
      .mockReturnValueOnce(profileUpdate)
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 1 }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(profileUpdate.set).not.toHaveBeenCalled()
  })

  it('active owner の匿名化では owner 行をロックして数える', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select
      .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
      .mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('inactive owner の匿名化では active owner 数ガードを実行しない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'inactive' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select
      .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'inactive' }]))
      .mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('最後の active owner は匿名化できない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select
      .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ ownerCount: 1 }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(422)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
