// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetWorkspaceMemberRole, mockRequireWorkspaceAdmin } = vi.hoisted(() => ({
  mockGetWorkspaceMemberRole: vi.fn(),
  mockRequireWorkspaceAdmin: vi.fn(),
}))

vi.mock('./access/membership', () => ({
  getWorkspaceRole: vi.fn(),
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  isWorkspaceOwner: vi.fn(),
  isWorkspaceAdmin: vi.fn(),
  isWorkspaceMember: vi.fn(),
  requireWorkspaceOwner: vi.fn(),
  requireWorkspaceAdmin: mockRequireWorkspaceAdmin,
  requireWorkspaceMember: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: { select: vi.fn() },
  channels: {},
  channelMembers: {},
  projects: {},
  projectMembers: {},
  messages: {},
  messageAttachments: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
}))

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('membership helper をそのまま re-export する', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockRequireWorkspaceAdmin.mockResolvedValue(null)

    const { getWorkspaceMemberRole, requireWorkspaceAdmin } = await import('./permissions')

    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')
    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()

    expect(mockGetWorkspaceMemberRole).toHaveBeenCalledWith('ws-1', 'user-1')
    expect(mockRequireWorkspaceAdmin).toHaveBeenCalledWith('ws-1', 'user-1')
  })
})
