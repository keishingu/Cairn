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

vi.mock('react', () => ({
  cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
    const memo = new Map<string, Result>()
    return (...args: Args) => {
      const key = JSON.stringify(args)
      if (!memo.has(key)) {
        memo.set(key, fn(...args))
      }
      return memo.get(key) as Result
    }
  },
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
    mockDb.select.mockReturnValue(selectChain([{ role: 'admin' }]))

    const { getWorkspaceMemberRole, requireWorkspaceAdmin } = await import('./permissions')

    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')
    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()

    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
