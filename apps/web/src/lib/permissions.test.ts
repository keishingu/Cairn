// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockSelectRoleResult,
  mockSelectChannelResult,
  mockSelectProjectMembershipResult,
  mockDb,
} = vi.hoisted(() => {
  const mockSelectRoleResult = vi.fn()
  const mockSelectChannelResult = vi.fn()
  const mockSelectProjectMembershipResult = vi.fn()
  const mockDb = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields?.role) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn(() => Promise.resolve(mockSelectRoleResult())),
            }),
          }),
        }
      }

      if (fields?.effectiveWorkspaceId) {
        return {
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn(() => Promise.resolve(mockSelectChannelResult())),
              }),
            }),
          }),
        }
      }

      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn(() => Promise.resolve(mockSelectProjectMembershipResult())),
            }),
          }),
          where: vi.fn().mockReturnValue({
            limit: vi.fn(() => Promise.resolve(mockSelectProjectMembershipResult())),
          }),
        }),
      }
    }),
  }

  return {
    mockSelectRoleResult,
    mockSelectChannelResult,
    mockSelectProjectMembershipResult,
    mockDb,
  }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    role: 'workspaceMembers.role',
    workspaceId: 'workspaceMembers.workspaceId',
    userId: 'workspaceMembers.userId',
    membershipStatus: 'workspaceMembers.membershipStatus',
  },
  channels: {
    id: 'channels.id',
    isPrivate: 'channels.isPrivate',
    type: 'channels.type',
    projectId: 'channels.projectId',
    workspaceId: 'channels.workspaceId',
  },
  channelMembers: {
    channelId: 'channelMembers.channelId',
    userId: 'channelMembers.userId',
  },
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
  },
  projectMembers: {
    id: 'projectMembers.id',
    projectId: 'projectMembers.projectId',
    userId: 'projectMembers.userId',
  },
  messages: {},
  messageAttachments: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockSelectRoleResult.mockReset()
    mockSelectChannelResult.mockReset()
    mockSelectProjectMembershipResult.mockReset()
  })

  it('getWorkspaceRole は inactive な所属を role なしとして扱う', async () => {
    mockSelectRoleResult.mockReturnValue([])

    const { getWorkspaceRole } = await import('./permissions')
    await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBeNull()
  })

  it('inactive な所属は requireWorkspaceMember で 403 になる', async () => {
    mockSelectRoleResult.mockReturnValue([])

    const { requireWorkspaceMember } = await import('./permissions')
    const result = await requireWorkspaceMember('ws-1', 'user-1')

    expect(result?.status).toBe(403)
  })

  it('inactive な所属は requireProjectAccess で 403 になる', async () => {
    mockSelectRoleResult.mockReturnValue([])
    mockSelectProjectMembershipResult.mockReturnValue([])

    const { requireProjectAccess } = await import('./permissions')
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')

    expect(result?.status).toBe(403)
  })

  it('inactive な所属は public channel でも requireChannelAccess で 403 になる', async () => {
    mockSelectRoleResult.mockReturnValue([])

    const { requireChannelAccess } = await import('./permissions')
    const result = await requireChannelAccess('ws-1', 'user-1', 'channel-1')

    expect(result?.status).toBe(403)
    expect(mockSelectChannelResult).not.toHaveBeenCalled()
  })
})
