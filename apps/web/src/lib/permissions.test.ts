// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockJson = vi.fn((body: unknown, init?: ResponseInit) => ({ body, status: init?.status ?? 200 }))

const {
  mockDb,
  workspaceMembers,
  channels,
  channelMembers,
  projects,
  projectMembers,
  messages,
  messageAttachments,
} = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  }

  return {
    mockDb,
    workspaceMembers: {
      role: 'wm.role',
      workspaceId: 'wm.workspaceId',
      userId: 'wm.userId',
    },
    channels: {
      id: 'c.id',
      isPrivate: 'c.isPrivate',
      type: 'c.type',
      projectId: 'c.projectId',
      workspaceId: 'c.workspaceId',
    },
    channelMembers: {
      userId: 'cm.userId',
      channelId: 'cm.channelId',
    },
    projects: {
      id: 'p.id',
      workspaceId: 'p.workspaceId',
    },
    projectMembers: {
      id: 'pm.id',
      userId: 'pm.userId',
      projectId: 'pm.projectId',
    },
    messages: {
      id: 'm.id',
      channelId: 'm.channelId',
    },
    messageAttachments: {
      fileId: 'ma.fileId',
      messageId: 'ma.messageId',
    },
  }
})

vi.mock('next/server', () => ({
  NextResponse: {
    json: mockJson,
  },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers,
  channels,
  channelMembers,
  projects,
  projectMembers,
  messages,
  messageAttachments,
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  sql: vi.fn(() => 'sql'),
}))

function selectResult(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
  Object.assign(chain, {
    leftJoin: vi.fn().mockReturnValue(chain),
    innerJoin: vi.fn().mockReturnValue(chain),
  })
  return chain
}

function selectDistinctResult(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  }
  Object.assign(chain, {
    innerJoin: vi.fn().mockReturnValue(chain),
  })
  return chain
}

describe('権限制御', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('requireWorkspaceOwner は owner だけを許可する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'owner' }]))
      .mockReturnValueOnce(selectResult([{ role: 'admin' }]))

    const { requireWorkspaceOwner } = await import('./permissions')

    await expect(requireWorkspaceOwner('ws-1', 'owner-1')).resolves.toBeNull()
    await expect(requireWorkspaceOwner('ws-1', 'admin-1')).resolves.toEqual({
      body: { error: 'この操作にはオーナー権限が必要です' },
      status: 403,
    })
  })

  it('requireWorkspaceAdmin は admin 以上を許可して guest を拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'admin' }]))
      .mockReturnValueOnce(selectResult([{ role: 'guest' }]))

    const { requireWorkspaceAdmin } = await import('./permissions')

    await expect(requireWorkspaceAdmin('ws-1', 'admin-1')).resolves.toBeNull()
    await expect(requireWorkspaceAdmin('ws-1', 'guest-1')).resolves.toEqual({
      body: { error: 'この操作には管理者以上の権限が必要です' },
      status: 403,
    })
  })

  it('requireWorkspaceMember は guest を拒否する', async () => {
    mockDb.select.mockReturnValueOnce(selectResult([{ role: 'guest' }]))

    const { requireWorkspaceMember } = await import('./permissions')

    await expect(requireWorkspaceMember('ws-1', 'guest-1')).resolves.toEqual({
      body: { error: 'ゲストはこの操作を実行できません' },
      status: 403,
    })
  })

  it('requireProjectAccess は guest の越境アクセスを拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(selectResult([]))

    const { requireProjectAccess } = await import('./permissions')

    await expect(requireProjectAccess('ws-1', 'guest-1', 'project-1')).resolves.toEqual({
      body: { error: 'このプロジェクトにアクセスする権限がありません' },
      status: 403,
    })
  })

  it('requireProjectAccess は guest が参加中の project を許可する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(selectResult([{ id: 'pm-1' }]))

    const { requireProjectAccess } = await import('./permissions')

    await expect(requireProjectAccess('ws-1', 'guest-1', 'project-1')).resolves.toBeNull()
  })

  it('requireChannelAccess は DM 参加者でない member を拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{
        isPrivate: false,
        type: 'dm',
        projectId: null,
        effectiveWorkspaceId: 'ws-1',
      }]))
      .mockReturnValueOnce(selectResult([]))

    const { requireChannelAccess } = await import('./permissions')

    await expect(requireChannelAccess('ws-1', 'member-1', 'channel-1')).resolves.toEqual({
      body: { error: 'このチャンネルにアクセスする権限がありません' },
      status: 403,
    })
  })

  it('requireChannelAccess は project channel の guest を projectMembers で制限する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{
        isPrivate: false,
        type: 'project',
        projectId: 'project-1',
        effectiveWorkspaceId: 'ws-1',
      }]))
      .mockReturnValueOnce(selectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(selectResult([]))

    const { requireChannelAccess } = await import('./permissions')

    await expect(requireChannelAccess('ws-1', 'guest-1', 'channel-1')).resolves.toEqual({
      body: { error: 'このチャンネルにアクセスする権限がありません' },
      status: 403,
    })
  })

  it('requireChannelAccess は別ワークスペースの channelId を拒否する', async () => {
    mockDb.select.mockReturnValueOnce(selectResult([{
      isPrivate: false,
      type: 'public',
      projectId: null,
      effectiveWorkspaceId: 'ws-2',
    }]))

    const { requireChannelAccess } = await import('./permissions')

    await expect(requireChannelAccess('ws-1', 'member-1', 'channel-1')).resolves.toEqual({
      body: { error: 'このチャンネルにアクセスする権限がありません' },
      status: 403,
    })
  })

  it('canAccessFile は別ワークスペースのファイルを拒否する', async () => {
    const { canAccessFile } = await import('./permissions')

    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-2',
      projectId: null,
      uploadedBy: 'user-2',
    })).resolves.toBe(false)
  })

  it('canAccessFile はアップロード者本人を許可する', async () => {
    const { canAccessFile } = await import('./permissions')

    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'user-1',
    })).resolves.toBe(true)
  })

  it('canAccessFile は project 未参加の guest を拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(selectResult([]))
    mockDb.selectDistinct.mockReturnValueOnce(selectDistinctResult([]))

    const { canAccessFile } = await import('./permissions')

    await expect(canAccessFile('ws-1', 'guest-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: 'project-1',
      uploadedBy: 'owner-1',
    })).resolves.toBe(false)
  })

  it('canAccessFile はアクセス可能な channel の message attachment を許可する', async () => {
    mockDb.select
      .mockReturnValueOnce(selectResult([{ role: 'member' }]))
      .mockReturnValueOnce(selectResult([{
        isPrivate: false,
        type: 'public',
        projectId: null,
        effectiveWorkspaceId: 'ws-1',
      }]))
    mockDb.selectDistinct.mockReturnValueOnce(selectDistinctResult([{ channelId: 'channel-1' }]))

    const { canAccessFile } = await import('./permissions')

    await expect(canAccessFile('ws-1', 'member-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'owner-1',
    })).resolves.toBe(true)
  })
})
