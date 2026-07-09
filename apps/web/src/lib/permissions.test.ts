// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockHeaders, mockDb } = vi.hoisted(() => {
  const mockHeaders = vi.fn()
  const mockDb = {
    select: vi.fn(),
  }
  return { mockHeaders, mockDb }
})

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    role: 'wm.role',
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
  inArray: vi.fn(() => 'inArray'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('同一リクエスト内では workspace role を 1 回だけ読む', async () => {
    const requestHeaders = new Headers()
    mockHeaders.mockResolvedValue(requestHeaders)
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-1', role: 'admin' }]))

    const {
      getWorkspaceMemberRole,
      requireWorkspaceAdmin,
      requireWorkspaceMember,
    } = await import('./permissions')

    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')
    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()
    await expect(requireWorkspaceMember('ws-1', 'user-1')).resolves.toBeNull()

    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
