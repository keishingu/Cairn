// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = 'ws-00000001'

const { mockGetAuthContext, mockGetWorkspaceMemberRole, mockIsWorkspaceAdmin, mockDb, mockGetUserById } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: 'ws-00000001',
    },
    error: null,
  })
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('member')
  const mockIsWorkspaceAdmin = vi.fn((role: string | null) => role === 'owner' || role === 'admin')
  const mockDb = { select: vi.fn() }
  const mockGetUserById = vi.fn()
  return { mockGetAuthContext, mockGetWorkspaceMemberRole, mockIsWorkspaceAdmin, mockDb, mockGetUserById }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ getWorkspaceMemberRole: mockGetWorkspaceMemberRole, isWorkspaceAdmin: mockIsWorkspaceAdmin }))
vi.mock('@/lib/supabase/service', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/supabase/service')>()
  return {
    ...actual,
    createServiceRoleClient: () => ({
      auth: {
        admin: {
          getUserById: mockGetUserById,
        },
      },
    }),
  }
})
vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'profiles.id', kind: 'profiles.kind', displayName: 'profiles.displayName' },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    displayName: 'wm.displayName',
    avatarUrl: 'wm.avatarUrl',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
    joinedAt: 'wm.joinedAt',
  },
  projectMembers: { userId: 'pm.userId', projectId: 'pm.projectId' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => ({ as: vi.fn(() => 'count_as') })),
  sql: vi.fn(() => 'sql'),
  inArray: vi.fn(() => 'inArray'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'as', 'orderBy']) {
    c[method] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('GET /api/workspaces/members', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  const request = (path = '/api/workspaces/members') => new Request(`http://localhost${path}`)

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WS_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
    mockIsWorkspaceAdmin.mockImplementation((role: string | null) => role === 'owner' || role === 'admin')
  })

  it('一覧レスポンスに email を含める', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{
        userId: USER_ID,
        displayName: '山田 太郎',
        avatarUrl: null,
        role: 'member',
        membershipStatus: 'active',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        projectCount: 3,
      }]))

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'taro@example.com' } },
      error: null,
    })

    const { GET } = await import('./route')
    const res = await GET(request())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([{
      userId: USER_ID,
      displayName: '山田 太郎',
      email: 'taro@example.com',
      avatarUrl: null,
      role: 'member',
      membershipStatus: 'active',
      joinedAt: '2026-01-01',
      projectCount: 3,
    }])
  })

  it('対象 userId ごとに email を解決する', async () => {
    const secondUserId = '00000000-0000-0000-0000-000000000002'
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([
        {
          userId: USER_ID,
          displayName: '山田 太郎',
          avatarUrl: null,
          role: 'member',
          membershipStatus: 'active',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          projectCount: 3,
        },
        {
          userId: secondUserId,
          displayName: '佐藤 花子',
          avatarUrl: null,
          role: 'admin',
          membershipStatus: 'active',
          joinedAt: new Date('2026-01-02T00:00:00.000Z'),
          projectCount: 5,
        },
      ]))

    mockGetUserById
      .mockResolvedValueOnce({
        data: { user: { email: 'taro@example.com' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { email: 'hanako@example.com' } },
        error: null,
      })

    const { GET } = await import('./route')
    const res = await GET(request())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      {
        userId: USER_ID,
        displayName: '山田 太郎',
        email: 'taro@example.com',
        avatarUrl: null,
        role: 'member',
        membershipStatus: 'active',
        joinedAt: '2026-01-01',
        projectCount: 3,
      },
      {
        userId: secondUserId,
        displayName: '佐藤 花子',
        email: 'hanako@example.com',
        avatarUrl: null,
        role: 'admin',
        membershipStatus: 'active',
        joinedAt: '2026-01-02',
        projectCount: 5,
      },
    ])
    expect(mockGetUserById).toHaveBeenNthCalledWith(1, USER_ID)
    expect(mockGetUserById).toHaveBeenNthCalledWith(2, secondUserId)
  })

  it('Auth 側に存在しないユーザーは email を null にする', async () => {
    const missingUserId = '00000000-0000-0000-0000-000000000099'
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{
        userId: missingUserId,
        displayName: '未登録 ユーザー',
        avatarUrl: null,
        role: 'guest',
        membershipStatus: 'inactive',
        joinedAt: new Date('2026-01-03T00:00:00.000Z'),
        projectCount: 0,
      }]))

    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: new Error('not found'),
    })

    const { GET } = await import('./route')
    const res = await GET(request('/api/workspaces/members?status=all'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([{
      userId: missingUserId,
      displayName: '未登録 ユーザー',
      email: null,
      avatarUrl: null,
      role: 'guest',
      membershipStatus: 'inactive',
      joinedAt: '2026-01-03',
      projectCount: 0,
    }])
  })

  it('status 未指定では active メンバーに限定する', async () => {
    const { eq } = await import('drizzle-orm')
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('wm.membershipStatus', 'active')
  })

  it('admin の status=all は非活性メンバーも取得対象にする', async () => {
    const { eq } = await import('drizzle-orm')
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET(request('/api/workspaces/members?status=all'))

    expect(res.status).toBe(200)
    expect(eq).not.toHaveBeenCalledWith('wm.membershipStatus', 'active')
  })

  it('admin 以外の status=all は active メンバーに限定する', async () => {
    const { eq } = await import('drizzle-orm')
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET(request('/api/workspaces/members?status=all'))

    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('wm.membershipStatus', 'active')
  })

  it('bot profile は一覧対象から除外する', async () => {
    const { eq } = await import('drizzle-orm')
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('profiles.kind', 'human')
  })
})
