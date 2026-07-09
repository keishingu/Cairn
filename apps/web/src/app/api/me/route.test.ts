// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDbSelect, mockCreateClient } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelect: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect },
  profiles: {
    id: 'profiles.id',
    bio: 'profiles.bio',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
    avatarUrl: 'workspaceMembers.avatarUrl',
    status: 'workspaceMembers.status',
    statusMessage: 'workspaceMembers.statusMessage',
    role: 'workspaceMembers.role',
  },
}))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'workspaceMemberDisplayName'),
}))

function createAwaitableBuilder<T>(rows: T[]) {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  return builder
}

describe('GET /api/me', () => {
  beforeEach(() => {
    mockDbSelect.mockReset()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockCreateClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { email: 'kei@example.com' } } },
        }),
      },
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('workspaceId を含めて返す', async () => {
    mockDbSelect.mockReturnValueOnce(createAwaitableBuilder([
      {
        id: DEV_USER_ID,
        displayName: 'Kei',
        avatarUrl: null,
        bio: null,
        status: 'online',
        statusMessage: null,
        wsRole: 'member',
      },
    ]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      id: DEV_USER_ID,
      workspaceId: DEV_WORKSPACE_ID,
      displayName: 'Kei',
      avatarUrl: null,
      email: 'kei@example.com',
      bio: null,
      status: 'online',
      statusMessage: null,
      wsRole: 'member',
    })
  })
})
