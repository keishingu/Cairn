// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, channelMembers, channels, profiles, projectMembers, workspaceMembers } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  }

  const channelMembers = {
    channelId: 'cm.channelId',
    userId: 'cm.userId',
  }

  const profiles = {
    id: 'p.id',
    displayName: 'p.displayName',
  }

  const channels = {
    id: 'c.id',
    projectId: 'c.projectId',
    type: 'c.type',
  }

  const projectMembers = {
    id: 'pm.id',
    projectId: 'pm.projectId',
    userId: 'pm.userId',
  }

  const workspaceMembers = {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  }

  return { mockDb, channelMembers, channels, profiles, projectMembers, workspaceMembers }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  channelMembers,
  channels,
  profiles,
  projectMembers,
  workspaceMembers,
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  isNotNull: vi.fn((...args: unknown[]) => ({ type: 'isNotNull', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  ne: vi.fn((...args: unknown[]) => ({ type: 'ne', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
}))

function makeSelectResult(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  }
  return chain
}

describe('notification-access', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('fetchActiveChannelRecipients は active workspace membership と guest の project access 条件を含める', async () => {
    const chain = makeSelectResult([])
    mockDb.select.mockReturnValueOnce(chain)

    const { fetchActiveChannelRecipients } = await import('./notification-access')
    await fetchActiveChannelRecipients({ channelId: 'ch-1', workspaceId: 'ws-1', senderId: 'user-1' })

    const workspaceJoin = chain.innerJoin.mock.calls[1]?.[1]
    expect(workspaceJoin.args).toContainEqual({ type: 'eq', args: [workspaceMembers.membershipStatus, 'active'] })
    expect(workspaceJoin.args).toContainEqual({ type: 'eq', args: [workspaceMembers.workspaceId, 'ws-1'] })

    const projectJoin = chain.leftJoin.mock.calls[0]?.[1]
    expect(projectJoin.args).toContainEqual({ type: 'eq', args: [projectMembers.projectId, channels.projectId] })
    expect(projectJoin.args).toContainEqual({ type: 'eq', args: [projectMembers.userId, channelMembers.userId] })

    const whereArg = chain.where.mock.calls[0]?.[0]
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [channelMembers.channelId, 'ch-1'] })
    expect(whereArg.args).toContainEqual({
      type: 'or',
      args: [
        { type: 'ne', args: [channels.type, 'project'] },
        { type: 'isNull', args: [channels.projectId] },
        { type: 'ne', args: [workspaceMembers.role, 'guest'] },
        { type: 'isNotNull', args: [projectMembers.id] },
      ],
    })
  })

  it('fetchActiveMentionedMembers は inactive member を通知対象から除外する条件を含める', async () => {
    const chain = makeSelectResult([])
    mockDb.select.mockReturnValueOnce(chain)

    const { fetchActiveMentionedMembers } = await import('./notification-access')
    await fetchActiveMentionedMembers({ workspaceId: 'ws-1', mentionedIds: ['user-2'], senderId: 'user-1' })

    const whereArg = chain.where.mock.calls[0]?.[0]
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.membershipStatus, 'active'] })
    expect(whereArg.args).toContainEqual({ type: 'inArray', args: [workspaceMembers.userId, ['user-2']] })
  })

  it('fetchActiveGuestIds は active guest だけを返す', async () => {
    const chain = makeSelectResult([{ userId: 'guest-1' }])
    mockDb.select.mockReturnValueOnce(chain)

    const { fetchActiveGuestIds } = await import('./notification-access')
    await expect(fetchActiveGuestIds({ workspaceId: 'ws-1', userIds: ['guest-1', 'guest-2'] }))
      .resolves.toEqual(new Set(['guest-1']))

    const whereArg = chain.where.mock.calls[0]?.[0]
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.membershipStatus, 'active'] })
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.role, 'guest'] })
  })

  it('isActiveWorkspaceMember は active membership のみ truthy を返す', async () => {
    const chain = makeSelectResult([{ userId: 'user-2' }])
    mockDb.select.mockReturnValueOnce(chain)

    const { isActiveWorkspaceMember } = await import('./notification-access')
    await expect(isActiveWorkspaceMember({ workspaceId: 'ws-1', userId: 'user-2' })).resolves.toBe(true)

    const whereArg = chain.where.mock.calls[0]?.[0]
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.workspaceId, 'ws-1'] })
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.userId, 'user-2'] })
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.membershipStatus, 'active'] })
  })
})
