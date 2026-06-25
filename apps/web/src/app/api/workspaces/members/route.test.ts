// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = 'ws-00000001'

const { mockGetAuthContext, mockGetWorkspaceMemberRole, mockDb, mockGetUserById } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: 'ws-00000001',
    },
    error: null,
  })
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('member')
  const mockDb = { select: vi.fn() }
  const mockGetUserById = vi.fn()
  return { mockGetAuthContext, mockGetWorkspaceMemberRole, mockDb, mockGetUserById }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ getWorkspaceMemberRole: mockGetWorkspaceMemberRole }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  }),
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    avatarUrl: 'wm.avatarUrl',
    role: 'wm.role',
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

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WS_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('member')
  })

  it('一覧レスポンスに email を含める', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{
        userId: USER_ID,
        displayName: '山田 太郎',
        avatarUrl: null,
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        projectCount: 3,
      }]))

    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'taro@example.com' } },
      error: null,
    })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([{
      userId: USER_ID,
      displayName: '山田 太郎',
      email: 'taro@example.com',
      avatarUrl: null,
      role: 'member',
      joinedAt: '2026-01-01',
      projectCount: 3,
    }])
  })
})
