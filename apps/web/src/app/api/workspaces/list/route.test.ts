// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}))

const getAuthUser = vi.fn()

vi.mock('@/lib/get-auth-context', () => ({
  getAuthUser,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaces: {
    id: 'workspaces.id',
    name: 'workspaces.name',
    slug: 'workspaces.slug',
    logoUrl: 'workspaces.logoUrl',
  },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    joinedAt: 'wm.joinedAt',
    membershipStatus: 'wm.membershipStatus',
  },
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
    role: 'awm.role',
    joinedAt: 'awm.joinedAt',
  },
}))

const { mockEq, mockAnd } = vi.hoisted(() => ({
  mockEq: vi.fn((left, right) => ({ type: 'eq', args: [left, right] })),
  mockAnd: vi.fn((...args) => ({ type: 'and', args })),
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
}))

function selectChain(result: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(result)
  const where = vi.fn().mockReturnValue({ orderBy })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  return { from, innerJoin, where, orderBy }
}

describe('GET /api/workspaces/list', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('active membership の workspace だけ返すクエリを組む', async () => {
    getAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    const chain = selectChain([
      { id: 'ws-1', name: 'Workspace', slug: 'workspace', logoUrl: null, role: 'member' },
    ])
    mockDb.select.mockReturnValue(chain)

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      { id: 'ws-1', name: 'Workspace', slug: 'workspace', logoUrl: null, role: 'member' },
    ])
    // active_workspace_members ビュー参照で active 絞り込みは不要（where は userId 単一条件）
    expect(chain.where.mock.calls[0]?.[0]).toEqual({ type: 'eq', args: ['awm.userId', 'user-1'] })
  })
})
