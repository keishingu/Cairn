// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { DEV_USER_ID, DEV_WORKSPACE_ID, mockGetAuthContext, mockDb, workspaceMembers, profiles } = vi.hoisted(() => {
  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
  const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: DEV_USER_ID,
      workspaceId: DEV_WORKSPACE_ID,
    },
    error: null,
  })
  const mockDb = {
    transaction: vi.fn(),
  }
  const workspaceMembers = {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    membershipStatus: 'wm.membershipStatus',
  }
  const profiles = {
    id: 'profiles.id',
  }
  return { DEV_USER_ID, DEV_WORKSPACE_ID, mockGetAuthContext, mockDb, workspaceMembers, profiles }
})

vi.mock('@cairn/shared', () => ({
  patchMeSchema: {
    safeParse: vi.fn((body: unknown) => ({ success: true, data: body })),
  },
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'display-name'),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles,
  workspaceMembers,
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  sql: vi.fn(() => 'sql'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }
}

describe('PATCH /api/me', () => {
  beforeEach(() => {
    mockDb.transaction.mockImplementation(async (callback: (tx: {
      execute: ReturnType<typeof vi.fn>
      select: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }) => Promise<unknown>) => callback({
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue(selectChain([{ userId: DEV_USER_ID }])),
      update: vi.fn().mockReturnValue(updateChain()),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('active member は bio を更新できる', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ bio: 'hello' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(res.status).toBe(200)
  })

  it('inactive member は 409 を返す', async () => {
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: {
      execute: ReturnType<typeof vi.fn>
      select: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }) => Promise<unknown>) => callback({
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue(selectChain([])),
      update: vi.fn().mockReturnValue(updateChain()),
    }))

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ bio: 'hello' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(res.status).toBe(409)
  })
})
