// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = 'proj-00000001'
const WORKSPACE_ID = 'ws-00000001'
const USER_ID = '00000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireWorkspaceAdmin,
  mockRequireWorkspaceMember,
  mockWorkspaceMemberDisplayName,
  mockDb,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: 'ws-00000001',
    },
    error: null,
  })
  const mockRequireWorkspaceAdmin = vi.fn().mockResolvedValue(null)
  const mockRequireWorkspaceMember = vi.fn().mockResolvedValue(null)
  const mockWorkspaceMemberDisplayName = vi.fn(() => 'workspaceMemberDisplayName')
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  }
  return {
    mockGetAuthContext,
    mockRequireWorkspaceAdmin,
    mockRequireWorkspaceMember,
    mockWorkspaceMemberDisplayName,
    mockDb,
  }
})

vi.mock('@cairn/shared', () => ({
  patchProjectSchema: {
    safeParse: vi.fn((input: unknown) => ({ success: true, data: input })),
  },
}))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireWorkspaceAdmin: mockRequireWorkspaceAdmin,
  requireWorkspaceMember: mockRequireWorkspaceMember,
}))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: mockWorkspaceMemberDisplayName,
}))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
    startDate: 'projects.startDate',
    endDate: 'projects.endDate',
  },
  projectStatuses: {
    id: 'projectStatuses.id',
    workspaceId: 'projectStatuses.workspaceId',
    name: 'projectStatuses.name',
  },
  channels: {
    id: 'channels.id',
    projectId: 'channels.projectId',
    type: 'channels.type',
    milestoneId: 'channels.milestoneId',
  },
  messages: {
    channelId: 'messages.channelId',
  },
  profiles: {
    id: 'profiles.id',
    displayName: 'profiles.displayName',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn(() => 'or'),
  isNull: vi.fn(() => 'isNull'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'leftJoin', 'where', 'limit']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('PATCH /api/projects/[id]', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('system message で workspace scoped な表示名を使う', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: PROJECT_ID }]))
      .mockReturnValueOnce(chain([{ id: 'channel-1' }]))
      .mockReturnValueOnce(chain([{ displayName: '退会したユーザー' }]))

    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]),
        }),
      }),
    })

    let insertedMessage: Record<string, unknown> | undefined
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((value: Record<string, unknown>) => {
        insertedMessage = value
        return Promise.resolve()
      }),
    })

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request(`http://localhost/api/projects/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新しい名前' }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(200)
    expect(mockWorkspaceMemberDisplayName).toHaveBeenCalledWith(
      'workspaceMembers.displayName',
      'profiles.displayName',
    )
    expect(insertedMessage).toMatchObject({
      channelId: 'channel-1',
      senderId: USER_ID,
      messageType: 'system',
      content: '退会したユーザーさんがプロジェクトを更新しました：プロジェクト名を「新しい名前」に変更しました',
    })
  })
})
