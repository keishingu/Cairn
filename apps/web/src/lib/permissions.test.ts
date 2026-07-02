// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const mockJson = vi.fn((body: unknown, init?: ResponseInit) => ({ body, status: init?.status ?? 200 }))

const { mockDb, workspaceMembers, channels, channelMembers, projects, projectMembers, messages, messageAttachments } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  }

  const workspaceMembers = {
    role: 'wm.role',
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    membershipStatus: 'wm.membershipStatus',
  }

  const channels = {
    id: 'c.id',
    isPrivate: 'c.isPrivate',
    type: 'c.type',
    projectId: 'c.projectId',
    workspaceId: 'c.workspaceId',
  }

  const channelMembers = {
    userId: 'cm.userId',
    channelId: 'cm.channelId',
  }

  const projects = {
    id: 'p.id',
    workspaceId: 'p.workspaceId',
  }

  const projectMembers = {
    id: 'pm.id',
    userId: 'pm.userId',
    projectId: 'pm.projectId',
  }

  const messages = {
    id: 'm.id',
    channelId: 'm.channelId',
  }

  const messageAttachments = {
    fileId: 'ma.fileId',
    messageId: 'ma.messageId',
  }

  return { mockDb, workspaceMembers, channels, channelMembers, projects, projectMembers, messages, messageAttachments }
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

function makeSelectResult(result: unknown[]) {
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

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('getWorkspaceRole は active メンバーだけを所属扱いにする', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectResult([]))

    const { getWorkspaceRole } = await import('./permissions')
    await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBeNull()

    const whereArg = mockDb.select.mock.results[0]?.value.where.mock.calls[0]?.[0]
    expect(whereArg.args).toContainEqual({ type: 'eq', args: [workspaceMembers.membershipStatus, 'active'] })
  })

  it('requireProjectAccess は inactive メンバーを 403 で拒否する', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectResult([]))

    const { requireProjectAccess } = await import('./permissions')
    const result = await requireProjectAccess('ws-1', 'user-1', 'project-1')

    expect(result).toEqual({
      body: { error: 'このプロジェクトにアクセスする権限がありません' },
      status: 403,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('requireChannelAccess は inactive メンバーをチャンネル参加前に 403 で拒否する', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectResult([]))

    const { requireChannelAccess } = await import('./permissions')
    const result = await requireChannelAccess('ws-1', 'user-1', 'channel-1')

    expect(result).toEqual({
      body: { error: 'このチャンネルにアクセスする権限がありません' },
      status: 403,
    })
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('canAccessFile は guest の自己アップロードでも現在のアクセス範囲外なら拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectResult([{ role: 'guest' }]))
    mockDb.selectDistinct.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })

    const { canAccessFile } = await import('./permissions')
    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'user-1',
      metadata: {},
    }, { pendingChannelId: 'channel-1' })).resolves.toBe(false)
  })

  it('canAccessFile は member の自己アップロードでも現在のアクセス範囲外なら拒否する', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectResult([{ role: 'member' }]))
      .mockReturnValueOnce(makeSelectResult([]))
    mockDb.selectDistinct.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })

    const { canAccessFile } = await import('./permissions')
    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'user-1',
      metadata: { channelIds: ['channel-1'] },
    })).resolves.toBe(false)
  })

  it('canAccessFile は guest の仮添付ファイルを同じ channel に投稿する時だけ許可する', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(makeSelectResult([{
        isPrivate: false,
        type: 'public',
        projectId: null,
        effectiveWorkspaceId: 'ws-1',
      }]))
    mockDb.selectDistinct.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })

    const { canAccessFile } = await import('./permissions')
    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'user-1',
      metadata: { pendingChannelId: 'channel-1' },
    }, { pendingChannelId: 'channel-1' })).resolves.toBe(true)
  })

  it('canAccessFile は guest の旧 channel 添付を別 channel へ再利用させない', async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(makeSelectResult([{ role: 'guest' }]))
      .mockReturnValueOnce(makeSelectResult([]))
    mockDb.selectDistinct.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })

    const { canAccessFile } = await import('./permissions')
    await expect(canAccessFile('ws-1', 'user-1', {
      id: 'file-1',
      workspaceId: 'ws-1',
      projectId: null,
      uploadedBy: 'user-1',
      metadata: { pendingChannelId: 'channel-1' },
    }, { pendingChannelId: 'channel-2' })).resolves.toBe(false)
  })

})
