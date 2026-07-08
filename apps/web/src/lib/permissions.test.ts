// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockHeaders } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockHeaders: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    role: 'wm.role',
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
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

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('同じ workspace/user のロール取得は 1 回だけ問い合わせる', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    mockDb.select.mockReturnValue(selectChain([{ role: 'admin' }]))

    const { getWorkspaceMemberRole, requireWorkspaceAdmin } = await import('./permissions')

    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')
    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()

    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
