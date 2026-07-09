// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockWorkspaceMemberDisplayName,
  mockDbSelect,
  mockDbUpdate,
  mockEq,
  mockAnd,
  mockGetSession,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockWorkspaceMemberDisplayName: vi.fn(() => 'workspaceMemberDisplayName'),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: mockWorkspaceMemberDisplayName,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}))

vi.mock('@cairn/shared', async () => {
  const { z } = await import('zod')
  return {
    patchMeSchema: z.object({
      displayName: z.string().trim().min(1).max(100).optional(),
      bio: z.string().max(1000).nullable().optional(),
      status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
      statusMessage: z.string().max(100).nullable().optional(),
    }).refine(
      data => Object.values(data).some(value => value !== undefined),
      { message: 'At least one field is required' },
    ),
  }
})

vi.mock('@cairn/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
    bio: 'profiles.bio',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
    avatarUrl: 'workspaceMembers.avatarUrl',
    role: 'workspaceMembers.role',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
}))

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

describe('/api/me', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'kei@example.com' } } },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('GET は在線情報を返さない', async () => {
    mockSelectResults([
      {
        id: DEV_USER_ID,
        displayName: 'Kei',
        avatarUrl: null,
        bio: 'bio',
        wsRole: 'owner',
      },
    ])

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: DEV_USER_ID,
      displayName: 'Kei',
      avatarUrl: null,
      email: 'kei@example.com',
      bio: 'bio',
      wsRole: 'owner',
    })
  })

  it('PATCH は在線ステータスだけの更新を受け付けない', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'away' }),
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'status/statusMessage は廃止されました' })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('PATCH はプロフィール更新に deprecated な在線フィールドが混ざると拒否する', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Kei', status: 'away' }),
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'status/statusMessage は廃止されました' })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('PATCH は不正な JSON shape を 422 で拒否する', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(null),
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: {
        formErrors: ['Expected object, received null'],
        fieldErrors: {},
      },
    })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})
