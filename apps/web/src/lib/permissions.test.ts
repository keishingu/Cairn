// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockEq, mockAnd, mockSql, selectResults, selectDistinctResults } = vi.hoisted(() => {
  const selectResults: unknown[][] = []
  const selectDistinctResults: unknown[][] = []

  function createSelectChain(result: unknown[], terminalAtWhere: boolean) {
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn().mockReturnValue(chain)
    chain.leftJoin = vi.fn().mockReturnValue(chain)
    chain.innerJoin = vi.fn().mockReturnValue(chain)
    chain.where = vi.fn().mockImplementation(() => {
      if (terminalAtWhere) return Promise.resolve(result)
      return {
        limit: vi.fn().mockResolvedValue(result),
      }
    })
    return chain
  }

  const mockDb = {
    select: vi.fn().mockImplementation(() => createSelectChain(selectResults.shift() ?? [], false)),
    selectDistinct: vi
      .fn()
      .mockImplementation(() => createSelectChain(selectDistinctResults.shift() ?? [], true)),
  }

  return {
    mockDb,
    mockEq: vi.fn(() => 'eq'),
    mockAnd: vi.fn(() => 'and'),
    mockSql: vi.fn(() => 'sql'),
    selectResults,
    selectDistinctResults,
  }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: { role: 'workspaceMembers.role', workspaceId: 'workspaceMembers.workspaceId', userId: 'workspaceMembers.userId' },
  channels: {
    id: 'channels.id',
    isPrivate: 'channels.isPrivate',
    type: 'channels.type',
    projectId: 'channels.projectId',
    workspaceId: 'channels.workspaceId',
  },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
  projectMembers: { id: 'projectMembers.id', projectId: 'projectMembers.projectId', userId: 'projectMembers.userId' },
  messages: { id: 'messages.id', channelId: 'messages.channelId' },
  messageAttachments: { messageId: 'messageAttachments.messageId', fileId: 'messageAttachments.fileId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  sql: mockSql,
}))

import {
  canAccessFile,
  requireChannelAccess,
  requireProjectAccess,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from './permissions'

function queueSelect(...results: unknown[][]) {
  selectResults.push(...results)
}

function queueSelectDistinct(...results: unknown[][]) {
  selectDistinctResults.push(...results)
}

async function expectForbidden(response: Response | null, message: string) {
  expect(response?.status).toBe(403)
  await expect(response?.json()).resolves.toEqual({ error: message })
}

describe('permissions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    selectResults.length = 0
    selectDistinctResults.length = 0
  })

  it('owner/admin/member の各ワークスペース権限を検証する', async () => {
    queueSelect([{ role: 'owner' }], [{ role: 'admin' }], [{ role: 'member' }], [{ role: 'guest' }])

    await expect(requireWorkspaceOwner('ws-1', 'user-1')).resolves.toBeNull()
    await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()
    await expect(requireWorkspaceMember('ws-1', 'user-1')).resolves.toBeNull()
    await expectForbidden(
      await requireWorkspaceMember('ws-1', 'user-1'),
      'ゲストはこの操作を実行できません',
    )
  })

  it('ゲストが参加していないプロジェクトへのアクセスを拒否する', async () => {
    queueSelect([{ role: 'guest' }], [])

    await expectForbidden(
      await requireProjectAccess('ws-1', 'guest-1', 'project-1'),
      'このプロジェクトにアクセスする権限がありません',
    )
  })

  it('DM の非参加者を拒否する', async () => {
    queueSelect([
      {
        isPrivate: false,
        type: 'dm',
        projectId: null,
        effectiveWorkspaceId: 'ws-1',
      },
    ], [])

    await expectForbidden(
      await requireChannelAccess('ws-1', 'user-1', 'channel-1'),
      'このチャンネルにアクセスする権限がありません',
    )
  })

  it('別ワークスペースの channelId を拒否する', async () => {
    queueSelect([
      {
        isPrivate: false,
        type: 'public',
        projectId: null,
        effectiveWorkspaceId: 'ws-2',
      },
    ])

    await expectForbidden(
      await requireChannelAccess('ws-1', 'user-1', 'channel-1'),
      'このチャンネルにアクセスする権限がありません',
    )
  })

  it('ゲストが参加していないプロジェクトチャンネルを拒否する', async () => {
    queueSelect(
      [
        {
          isPrivate: false,
          type: 'project',
          projectId: 'project-1',
          effectiveWorkspaceId: 'ws-1',
        },
      ],
      [{ role: 'guest' }],
      [],
    )

    await expectForbidden(
      await requireChannelAccess('ws-1', 'guest-1', 'channel-1'),
      'このチャンネルにアクセスする権限がありません',
    )
  })

  it('別ワークスペースのファイルは拒否する', async () => {
    await expect(
      canAccessFile('ws-1', 'user-1', {
        id: 'file-1',
        workspaceId: 'ws-2',
        projectId: null,
        uploadedBy: 'other-user',
      }),
    ).resolves.toBe(false)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('アップロード者本人は常にアクセスできる', async () => {
    await expect(
      canAccessFile('ws-1', 'user-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'user-1',
      }),
    ).resolves.toBe(true)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('ゲストが参加外プロジェクトのファイルへアクセスすると拒否する', async () => {
    queueSelect([{ role: 'guest' }], [])
    queueSelectDistinct([])

    await expect(
      canAccessFile('ws-1', 'guest-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        uploadedBy: 'other-user',
      }),
    ).resolves.toBe(false)
  })

  it('アクセス可能なチャンネルに添付されたファイルは許可する', async () => {
    queueSelect(
      [{ role: 'member' }],
      [
        {
          isPrivate: false,
          type: 'public',
          projectId: null,
          effectiveWorkspaceId: 'ws-1',
        },
      ],
    )
    queueSelectDistinct([{ channelId: 'channel-1' }])

    await expect(
      canAccessFile('ws-1', 'member-1', {
        id: 'file-1',
        workspaceId: 'ws-1',
        projectId: null,
        uploadedBy: 'other-user',
      }),
    ).resolves.toBe(true)
  })
})
