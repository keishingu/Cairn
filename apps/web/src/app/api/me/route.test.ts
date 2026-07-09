// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockDb, mockGetSession } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: 'user-1', workspaceId: 'ws-1' },
    error: null,
  })
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  }
  const mockGetSession = vi.fn().mockResolvedValue({
    data: { session: { user: { email: 'me@example.com' } } },
  })
  return { mockGetAuthContext, mockDb, mockGetSession }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@cairn/shared', () => ({
  patchMeSchema: {
    safeParse: vi.fn((value: unknown) => ({ success: true, data: value })),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}))

vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'workspaceMemberDisplayName'),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
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
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function chain<T>(result: T) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const method of ['from', 'leftJoin', 'where']) {
    c[method] = vi.fn().mockReturnValue(c)
  }
  return c
}

function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
}

describe('/api/me', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET は在線ステータスを返さない', async () => {
    mockDb.select.mockReturnValueOnce(chain([{
      id: 'user-1',
      displayName: '新宮 圭',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'bio',
      wsRole: 'owner',
    }]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: 'user-1',
      displayName: '新宮 圭',
      avatarUrl: 'https://example.com/avatar.png',
      email: 'me@example.com',
      bio: 'bio',
      wsRole: 'owner',
    })
  })

  it('PATCH は表示名と bio だけを更新する', async () => {
    const profileUpdate = updateChain()
    const memberUpdate = updateChain()
    mockDb.update.mockReturnValueOnce(profileUpdate).mockReturnValueOnce(memberUpdate)

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: ' えびちゃん ', bio: '相棒' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    expect(profileUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        bio: '相棒',
      }),
    )
    expect(memberUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'えびちゃん',
      }),
    )
  })
})
