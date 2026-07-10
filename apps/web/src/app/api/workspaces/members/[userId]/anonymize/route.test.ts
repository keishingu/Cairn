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
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
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
  documentChunks: {
    workspaceId: 'dc.workspaceId',
    sourceType: 'dc.sourceType',
    sourceId: 'dc.sourceId',
  },
  projectMembers: {
    projectId: 'pm.projectId',
    userId: 'pm.userId',
  },
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
  },
  tasks: {
    id: 'tasks.id',
    createdBy: 'tasks.createdBy',
  },
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
  inArray: vi.fn(() => 'inArray'),
  count: vi.fn(() => 'count'),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

function selectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  const joined = {
    where: vi.fn().mockReturnValue(whereReturn),
  }
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
      innerJoin: vi.fn().mockReturnValue(joined),
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

function deleteChain() {
  return {
    where: vi.fn().mockResolvedValue([]),
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
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb))
    mockDb.execute.mockResolvedValue(undefined)
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
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
    expect(mockRemove).toHaveBeenCalledWith(['ws-1/user-2.png'])
    const body = await res.json() as { anonymized: boolean }
    expect(body.anonymized).toBe(true)
  })

  it('アバター削除に失敗したら 500 を返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([
      { avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/ws-1/user-2.png' },
    ]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockRemove.mockResolvedValueOnce({ error: { message: 'boom' } })

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(500)
    expect(mockDb.update).toHaveBeenCalled()
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
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const memberUpdate = updateChain()
    const profileUpdate = updateChain()
    mockDb.delete.mockReturnValueOnce(deleteChain())
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

  it('active owner の匿名化では対象 user と active owner 行をまとめてロックして数える', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select
      .mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
      .mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalled()
    expect(mockDb.execute.mock.calls[0]?.[0]).toMatchObject({
      values: [OTHER_USER_ID, DEV_WORKSPACE_ID],
    })
  })

  it('profile 匿名化前に対象 user の全 membership をロックする', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalled()
    expect(mockDb.execute.mock.calls[0]?.[0]).toMatchObject({
      values: [OTHER_USER_ID, DEV_WORKSPACE_ID],
    })
  })

  it('匿名化した送信者の通知と task 通知をまとめて scrub する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain('delete from notifications')
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain("type in ('dm', 'mention', 'file')")
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain("type = 'task'")
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain('from tasks')
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain("coalesce(notifications.data->>'taskId', '') = ''")
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain("notifications.data->>'assignerName' in")
    expect(mockDb.execute.mock.calls[1]?.[0]?.strings.join('')).toContain('from profiles')
    expect(mockDb.execute.mock.calls[1]?.[0]?.values).toContain(DEV_WORKSPACE_ID)
    expect(mockDb.execute.mock.calls[1]?.[0]?.values).toContain(OTHER_USER_ID)
    expect(mockDb.execute.mock.calls[1]?.[0]?.values).toContain(`%<@${OTHER_USER_ID}>%`)
  })

  it('同一 workspace の owner 匿名化でも row lock 順が安定する', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select
      .mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
      .mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.execute.mock.calls[0]?.[0]?.strings.join('')).toContain('order by workspace_id, user_id')
    expect(mockDb.execute.mock.calls[0]?.[0]).toMatchObject({
      values: [OTHER_USER_ID, DEV_WORKSPACE_ID],
    })
  })

  it('inactive owner の匿名化では active owner 数ガードを実行しない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'inactive' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.delete.mockReturnValueOnce(deleteChain())
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
  })

  it('匿名化した member を含む project チャンクも削除する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'member', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([]))
    mockDb.update.mockReturnValueOnce(updateChain())
    mockDb.delete
      .mockReturnValueOnce(deleteChain())
      .mockReturnValueOnce(deleteChain())
    mockDb.select.mockReturnValueOnce(selectChain([{ projectId: 'project-1' }, { projectId: 'project-2' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ membershipCount: 0 }]))
    mockDb.update.mockReturnValueOnce(updateChain())

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockDb.delete).toHaveBeenCalledTimes(2)
  })

  it('最後の active owner は匿名化できない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select
      .mockReturnValueOnce(selectChain([{ userId: OTHER_USER_ID, role: 'owner', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ ownerCount: 1 }]))

    const { POST } = await import('./route')
    const res = await POST(postRequest(OTHER_USER_ID), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(422)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
