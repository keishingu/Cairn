// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = 'ws-00000001'
const TARGET_ID = '00000000-0000-0000-0000-000000000002'

const { mockGetAuthContext, mockIsWorkspaceAdmin, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockIsWorkspaceAdmin: vi.fn((role: string | null) => role === 'owner' || role === 'admin'),
  mockDb: { select: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ isWorkspaceAdmin: mockIsWorkspaceAdmin }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects: {
    id: 'projects.id',
    title: 'projects.title',
    workspaceId: 'projects.workspaceId',
    statusId: 'projects.statusId',
    startDate: 'projects.startDate',
    endDate: 'projects.endDate',
    archived: 'projects.archived',
    createdAt: 'projects.createdAt',
  },
  projectStatuses: { id: 'projectStatuses.id', name: 'projectStatuses.name', color: 'projectStatuses.color' },
  projectMembers: {
    userId: 'projectMembers.userId',
    projectId: 'projectMembers.projectId',
    role: 'projectMembers.role',
    roleId: 'projectMembers.roleId',
  },
  projectRoles: {
    id: 'projectRoles.id',
    workspaceId: 'projectRoles.workspaceId',
    name: 'projectRoles.name',
    color: 'projectRoles.color',
  },
  workspaceMembers: {
    id: 'workspaceMembers.id',
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
    membershipStatus: 'workspaceMembers.membershipStatus',
  },
  activeWorkspaceMembers: {
    workspaceId: 'activeWorkspaceMembers.workspaceId',
    userId: 'activeWorkspaceMembers.userId',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
  inArray: vi.fn(() => 'inArray'),
}))

function chain(result: unknown[]) {
  const pending = Promise.resolve(result)
  const builder: Record<string, unknown> = {
    then: pending.then.bind(pending),
    catch: pending.catch.bind(pending),
    finally: pending.finally.bind(pending),
  }
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy']) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  return builder
}

describe('GET /api/workspaces/members/[userId]/projects', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('カスタム役割は legacy の member ではなく設定名と色を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: 'membership-1', membershipStatus: 'active' }]))
      .mockReturnValueOnce(chain([{
        projectId: 'project-1',
        title: '文化祭',
        statusName: '進行中',
        statusColor: '#3B82F6',
        role: 'member',
        roleName: 'デザイナー',
        roleColor: '#EC4899',
        startDate: null,
        endDate: null,
        archived: false,
      }]))
      .mockReturnValueOnce(chain([{ projectId: 'project-1', n: 2 }]))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), {
      params: Promise.resolve({ userId: TARGET_ID }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        role: 'member',
        roleName: 'デザイナー',
        roleColor: '#EC4899',
      }),
    ])
  })
})
