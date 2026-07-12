// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  }

  return { mockDb }
})

vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'workspaceMemberDisplayName'),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceInvites: {
    token: 'workspaceInvites.token',
    workspaceId: 'workspaceInvites.workspaceId',
    createdBy: 'workspaceInvites.createdBy',
    role: 'workspaceInvites.role',
    expiresAt: 'workspaceInvites.expiresAt',
    maxUses: 'workspaceInvites.maxUses',
    useCount: 'workspaceInvites.useCount',
    projectId: 'workspaceInvites.projectId',
  },
  workspaces: {
    id: 'workspaces.id',
    name: 'workspaces.name',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  projects: {
    id: 'projects.id',
    title: 'projects.title',
  },
  workspaceMembers: {
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
    displayName: 'workspaceMembers.displayName',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  or: vi.fn(() => 'or'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
}))

function selectChain(result: unknown[]) {
  const whereReturn = {
    limit: vi.fn().mockResolvedValue(result),
  }
  const fromChain = {
    innerJoin: vi.fn(() => fromChain),
    where: vi.fn().mockReturnValue(whereReturn),
  }
  return {
    from: vi.fn().mockReturnValue(fromChain),
  }
}

describe('GET /api/invite/[token]', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('workspace の表示名で招待作成者を返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{
      role: 'member',
      expiresAt: null,
      maxUses: null,
      useCount: 0,
      projectId: null,
      workspaceName: 'Cairn',
      createdByName: '退会したユーザー',
    }]))

    const { GET } = await import('./route')
    const res = await GET(
      new Request('http://localhost/api/invite/token-1'),
      { params: Promise.resolve({ token: 'token-1' }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { createdByName: string }
    expect(body.createdByName).toBe('退会したユーザー')
  })
})
