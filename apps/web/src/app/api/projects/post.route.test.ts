// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '00000000-0000-0000-0000-000000000099'
const MEMBER_A = '00000000-0000-0000-0000-000000000010'
const MEMBER_B = '00000000-0000-0000-0000-000000000011'

const { mockGetAuthContext, mockRequireRole, mockDb, mockRunForActiveMemberships } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
      role: 'admin',
    },
    error: null,
  })
  const mockRequireRole = vi.fn().mockReturnValue(null)
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
  }
  const mockRunForActiveMemberships = vi.fn()
  return { mockGetAuthContext, mockRequireRole, mockDb, mockRunForActiveMemberships }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireRole: mockRequireRole }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMemberships: mockRunForActiveMemberships,
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects: {
    id: 'p.id',
    workspaceId: 'p.workspaceId',
    title: 'p.title',
    description: 'p.description',
    statusId: 'p.statusId',
    startDate: 'p.startDate',
    endDate: 'p.endDate',
    coverPhotoUrl: 'p.coverPhotoUrl',
    location: 'p.location',
    placeId: 'p.placeId',
    createdBy: 'p.createdBy',
  },
  channels: {
    workspaceId: 'c.workspaceId',
    projectId: 'c.projectId',
    type: 'c.type',
  },
  projectMembers: {
    projectId: 'pm.projectId',
    userId: 'pm.userId',
    role: 'pm.role',
    attendance: 'pm.attendance',
  },
  projectStatuses: {
    id: 'ps.id',
    name: 'ps.name',
    color: 'ps.color',
  },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    displayName: 'wm.displayName',
    avatarUrl: 'wm.avatarUrl',
  },
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
  },
  profiles: {
    id: 'pr.id',
    displayName: 'pr.displayName',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

describe('POST /api/projects', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    mockRunForActiveMemberships.mockImplementation(
      async (_db: unknown, _workspaceId: string, _userIds: string[], action: (tx: unknown) => unknown) => action(mockDb),
    )
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
  })

  it('作成者を project_members に自動追加しない', async () => {
    let insertCount = 0

    mockDb.insert.mockImplementation(() => {
      insertCount += 1

      if (insertCount === 1) {
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: PROJECT_ID,
              title: '新規プロジェクト',
              description: null,
              startDate: null,
              endDate: null,
              coverPhotoUrl: null,
              location: null,
            }]),
          }),
        }
      }

      return {
        values: vi.fn().mockResolvedValue(undefined),
      }
    })

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '新規プロジェクト',
      }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { memberCount: number; isMember: boolean }
    expect(body.memberCount).toBe(0)
    expect(body.isMember).toBe(false)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    expect(mockRunForActiveMemberships).toHaveBeenCalledWith(
      mockDb,
      '00000000-0000-0000-0000-000000000010',
      ['00000000-0000-0000-0000-000000000001'],
      expect.any(Function),
    )
  })

  it('指定した複数メンバーを project_members に追加する', async () => {
    const selectChain = (result: unknown[]) => {
      const p = Promise.resolve(result)
      const c: Record<string, unknown> = {
        then: p.then.bind(p),
        catch: p.catch.bind(p),
        finally: p.finally.bind(p),
      }
      for (const m of ['from', 'where', 'leftJoin']) c[m] = vi.fn().mockReturnValue(c)
      return c
    }

    let insertCount = 0
    mockDb.select
      .mockReturnValueOnce(selectChain([
        { userId: MEMBER_A, displayName: 'Alice', avatarUrl: 'https://example.com/a.png' },
        { userId: MEMBER_B, displayName: 'Bob', avatarUrl: null },
      ]))

    mockDb.insert.mockImplementation(() => {
      insertCount += 1

      if (insertCount === 1) {
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: PROJECT_ID,
              title: '新規プロジェクト',
              description: null,
              startDate: null,
              endDate: null,
              coverPhotoUrl: null,
              location: null,
            }]),
          }),
        }
      }

      return {
        values: vi.fn().mockResolvedValue(undefined),
      }
    })

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '新規プロジェクト',
        memberUserIds: [MEMBER_A, MEMBER_B],
      }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { memberCount: number; memberNames: string[]; isMember: boolean }
    expect(body.memberCount).toBe(2)
    expect(body.memberNames).toEqual(['Alice', 'Bob'])
    expect(body.isMember).toBe(false)
    expect(mockDb.insert).toHaveBeenCalledTimes(3)
    expect(mockRunForActiveMemberships).toHaveBeenCalledWith(
      mockDb,
      '00000000-0000-0000-0000-000000000010',
      ['00000000-0000-0000-0000-000000000001', MEMBER_A, MEMBER_B],
      expect.any(Function),
    )
  })

  it('退会済みの選択メンバーがいれば作成しない', async () => {
    mockRunForActiveMemberships.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新規プロジェクト', memberUserIds: [MEMBER_A] }),
    }))

    expect(res.status).toBe(422)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
