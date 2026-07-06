// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthUser, mockDb } = vi.hoisted(() => {
  const mockGetAuthUser = vi.fn().mockResolvedValue({ userId: 'user-1', error: null })
  const mockDb = {
    select: vi.fn(),
  }
  return { mockGetAuthUser, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthUser: mockGetAuthUser,
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
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
    role: 'workspaceMembers.role',
    membershipStatus: 'workspaceMembers.membershipStatus',
    joinedAt: 'workspaceMembers.joinedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  }
}

describe('GET /api/workspaces/list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('active な所属だけを返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([
      { id: 'ws-1', name: 'Workspace', slug: 'workspace', logoUrl: null, role: 'member' },
    ]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      { id: 'ws-1', name: 'Workspace', slug: 'workspace', logoUrl: null, role: 'member' },
    ])
  })
})
