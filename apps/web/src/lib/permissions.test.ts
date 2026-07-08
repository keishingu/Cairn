// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  },
  channels: {},
  channelMembers: {},
  projects: {},
  projectMembers: {},
  messages: {},
  messageAttachments: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  sql: vi.fn(),
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

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('getWorkspaceMemberRole は inactive membership を権限として扱わない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { getWorkspaceMemberRole } = await import('./permissions')
    const role = await getWorkspaceMemberRole('ws-1', 'user-1')

    expect(role).toBeNull()
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
