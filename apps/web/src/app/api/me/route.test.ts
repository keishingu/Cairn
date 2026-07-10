// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockSupabase, mockDb } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: 'user-1',
      workspaceId: 'ws-1',
    },
    error: null,
  })
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { email: 'kei@example.com' } } },
      }),
    },
  }
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  }
  return { mockGetAuthContext, mockSupabase, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => '表示名'),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
    bio: 'profiles.bio',
  },
  workspaceMembers: {
    displayName: 'wm.displayName',
    avatarUrl: 'wm.avatarUrl',
    role: 'wm.role',
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('/api/me', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
  })

  it('GET は在線関連の項目を返さない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{
      id: 'user-1',
      displayName: '表示名',
      avatarUrl: null,
      bio: 'bio',
      wsRole: 'member',
    }]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: 'user-1',
      displayName: '表示名',
      avatarUrl: null,
      email: 'kei@example.com',
      bio: 'bio',
      wsRole: 'member',
    })
  })

  it('PATCH は在線更新リクエストを受け付けない', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'online', statusMessage: 'います' }),
    }))

    expect(res.status).toBe(422)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
