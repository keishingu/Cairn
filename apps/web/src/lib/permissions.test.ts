// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  queryResults,
  mockDb,
  mockHeaders,
} = vi.hoisted(() => {
  const queryResults: unknown[][] = []
  const requestHeaders = new Headers()
  const mockHeaders = vi.fn().mockResolvedValue(requestHeaders)

  function nextResult() {
    return queryResults.shift() ?? []
  }

  function makeQuery(result: unknown[]) {
    const promise = Promise.resolve(result)
    return {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    }
  }

  const mockDb = {
    select: vi.fn(() => makeQuery(nextResult())),
    selectDistinct: vi.fn(() => makeQuery(nextResult())),
  }

  return { queryResults, mockDb, mockHeaders }
})

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  activeWorkspaceMembers: {
    role: 'activeWorkspaceMembers.role',
    userId: 'activeWorkspaceMembers.userId',
    workspaceId: 'activeWorkspaceMembers.workspaceId',
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
  messages: {
    channelId: 'messages.channelId',
    id: 'messages.id',
  },
  messageAttachments: {
    fileId: 'messageAttachments.fileId',
    messageId: 'messageAttachments.messageId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

function pushResults(...results: unknown[][]) {
  queryResults.push(...results)
}

describe('permissions', () => {
  beforeEach(() => {
    queryResults.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('requireWorkspaceOwner は owner のみ許可する', async () => {
    pushResults([{ role: 'owner' }], [{ role: 'admin' }])
    const { requireWorkspaceOwner } = await import('./permissions')

    await expect(requireWorkspaceOwner('ws-1', 'user-1')).resolves.toBeNull()

    const denied = await requireWorkspaceOwner('ws-1', 'user-2')
    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({ error: 'この操作にはオーナー権限が必要です' })
  })

  it('requireWorkspaceAdmin は admin 以上、requireWorkspaceMember は member 以上を要求する', async () => {
    pushResults([{ role: 'admin' }], [{ role: 'guest' }], [{ role: 'member' }], [])
    const { requireWorkspaceAdmin, requireWorkspaceMember } = await import('./permissions')

    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()

    const guestDenied = await requireWorkspaceAdmin('ws-1', 'user-2')
    expect(guestDenied?.status).toBe(403)
    await expect(guestDenied?.json()).resolves.toEqual({ error: 'この操作には管理者以上の権限が必要です' })

    await expect(requireWorkspaceMember('ws-1', 'user-3')).resolves.toBeNull()

    const outsiderDenied = await requireWorkspaceMember('ws-1', 'user-4')
    expect(outsiderDenied?.status).toBe(403)
    await expect(outsiderDenied?.json()).resolves.toEqual({ error: 'ゲストはこの操作を実行できません' })
  })

  it('非権限ゲートの role 参照は同一 request 内で再利用する', async () => {
    pushResults([{ role: 'admin' }])
    const { getWorkspaceMemberRole } = await import('./permissions')

    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')
    await expect(getWorkspaceMemberRole('ws-1', 'user-1')).resolves.toBe('admin')

    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('requireProjectAccess は guest の参加外プロジェクトを 403 にする', async () => {
    pushResults([{ role: 'guest' }], [])
    const { requireProjectAccess } = await import('./permissions')

    const denied = await requireProjectAccess('ws-1', 'guest-1', 'project-1')

    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({ error: 'このプロジェクトにアクセスする権限がありません' })
  })

  it('requireChannelAccess は別ワークスペースの channelId を 403 にする', async () => {
    pushResults([{ isPrivate: false, type: 'channel', projectId: null, effectiveWorkspaceId: 'ws-2' }])
    const { requireChannelAccess } = await import('./permissions')

    const denied = await requireChannelAccess('ws-1', 'user-1', 'channel-1')

    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({ error: 'このチャンネルにアクセスする権限がありません' })
  })

  it('requireChannelAccess は DM の非メンバーを 403 にする', async () => {
    pushResults([{ isPrivate: false, type: 'dm', projectId: null, effectiveWorkspaceId: 'ws-1' }], [])
    const { requireChannelAccess } = await import('./permissions')

    const denied = await requireChannelAccess('ws-1', 'user-1', 'dm-1')

    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({ error: 'このチャンネルにアクセスする権限がありません' })
  })

  it('requireChannelAccess は guest の参加外プロジェクトチャンネルを 403 にする', async () => {
    pushResults(
      [{ isPrivate: false, type: 'project', projectId: 'project-1', effectiveWorkspaceId: 'ws-1' }],
      [{ role: 'guest' }],
      [],
    )
    const { requireChannelAccess } = await import('./permissions')

    const denied = await requireChannelAccess('ws-1', 'guest-1', 'channel-1')

    expect(denied?.status).toBe(403)
    await expect(denied?.json()).resolves.toEqual({ error: 'このチャンネルにアクセスする権限がありません' })
  })

  it('canAccessFile は別ワークスペースのファイルを拒否する', async () => {
    const { canAccessFile } = await import('./permissions')

    await expect(
      canAccessFile('ws-1', 'user-1', {
        id: 'file-1',
        workspaceId: 'ws-2',
        projectId: null,
        uploadedBy: 'user-2',
      }),
    ).resolves.toBe(false)
  })

  it('canAccessFile はアップロード者本人を常に許可する', async () => {
    const { canAccessFile } = await import('./permissions')

    await expect(
      canAccessFile('ws-1', 'user-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'user-1',
      }),
    ).resolves.toBe(true)
  })

  it('canAccessFile は guest が参加外プロジェクトのファイルへアクセスできない', async () => {
    pushResults([{ role: 'guest' }], [], [])
    const { canAccessFile } = await import('./permissions')

    await expect(
      canAccessFile('ws-1', 'guest-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'user-2',
      }),
    ).resolves.toBe(false)
  })

  it('canAccessFile はアクセス可能なチャンネルの添付ファイルを許可する', async () => {
    pushResults(
      [{ role: 'member' }],
      [{ channelId: 'private-1' }],
      [{ id: 'private-1', isPrivate: true, type: 'channel', projectId: null, effectiveWorkspaceId: 'ws-1' }],
      [{ channelId: 'private-1' }],
    )
    const { canAccessFile } = await import('./permissions')

    await expect(
      canAccessFile('ws-1', 'member-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: null,
        uploadedBy: 'user-2',
      }),
    ).resolves.toBe(true)
  })
})
