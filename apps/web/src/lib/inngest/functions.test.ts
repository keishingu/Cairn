// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateFunction,
  mockDeleteWhere,
  mockDelete,
  mockEmbed,
  mockInsertValues,
  mockSendPushToUser,
  mockDb,
} = vi.hoisted(() => {
  const mockCreateFunction = vi.fn((_opts: unknown, _trigger: unknown, handler: unknown) => handler)
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn(() => ({
    where: mockDeleteWhere,
  }))
  const mockEmbed = vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] })
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockSendPushToUser = vi.fn().mockResolvedValue(undefined)
  const mockDb = {
    select: vi.fn(),
    delete: mockDelete,
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  }

  return {
    mockCreateFunction,
    mockDeleteWhere,
    mockDelete,
    mockEmbed,
    mockInsertValues,
    mockSendPushToUser,
    mockDb,
  }
})

vi.mock('./client', () => ({
  inngest: {
    createFunction: mockCreateFunction,
  },
}))

vi.mock('@/lib/push/send', () => ({
  sendPushToUser: mockSendPushToUser,
}))

vi.mock('ai', () => ({
  embed: mockEmbed,
}))

vi.mock('@/lib/ai/client', () => ({
  EMBEDDING_MODEL: 'test-embedding',
  openai: {
    embedding: vi.fn(() => 'embedding-model'),
  },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  activeWorkspaceMembers: {
    userId: 'activeWorkspaceMembers.userId',
    workspaceId: 'activeWorkspaceMembers.workspaceId',
  },
  documentChunks: {
    sourceType: 'documentChunks.sourceType',
    sourceId: 'documentChunks.sourceId',
    workspaceId: 'documentChunks.workspaceId',
  },
  memberExperiences: {
    userId: 'memberExperiences.userId',
    category: 'memberExperiences.category',
    title: 'memberExperiences.title',
    level: 'memberExperiences.level',
    notes: 'memberExperiences.notes',
  },
  notifications: {},
  profiles: {
    id: 'profiles.id',
    bio: 'profiles.bio',
    displayName: 'profiles.displayName',
  },
  tasks: {
    id: 'tasks.id',
    createdBy: 'tasks.createdBy',
  },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    displayName: 'workspaceMembers.displayName',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

function taskSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  }
}

function memberSelectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereReturn),
      }),
    }),
  }
}

describe('onTaskAssigned', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('匿名化後は task 作成者名をジョブ実行時点で再解決する', async () => {
    mockDb.select.mockReturnValueOnce(taskSelectChain([{ displayName: '匿名化済みメンバー' }]))

    const { onTaskAssigned } = await import('./functions')
    const handler = onTaskAssigned as unknown as (args: {
      event: {
        data: {
          taskId: string
          taskTitle: string
          assigneeId: string
          assignerId: string
          projectId: string
          projectTitle: string
          workspaceId: string
          assignerName: string
        }
      }
      step: {
        run: (_name: string, fn: () => Promise<unknown>) => Promise<unknown>
      }
    }) => Promise<unknown>
    const step = {
      run: async (_name: string, fn: () => Promise<unknown>) => fn(),
    }

    await handler({
      event: {
        data: {
          taskId: 'task-1',
          taskTitle: 'やること',
          assigneeId: 'user-2',
          assignerId: 'user-1',
          projectId: 'project-1',
          projectTitle: 'PJ',
          workspaceId: 'ws-1',
          assignerName: '旧表示名',
        },
      },
      step,
    })

    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: 'user-2',
      workspaceId: 'ws-1',
      type: 'task',
      title: '匿名化済みメンバー があなたにタスクを割り当てました',
      body: '「やること」- PJ',
      data: {
        assignerId: 'user-1',
        assignerName: '匿名化済みメンバー',
        projectTitle: 'PJ',
        taskId: 'task-1',
      },
    })
    expect(mockSendPushToUser).toHaveBeenCalledWith('user-2', {
      title: '匿名化済みメンバー があなたにタスクを割り当てました',
      body: '「やること」- PJ',
      url: '/tasks',
    })
  })
})

describe('indexMemberChunks', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('active member の bio と経験を chunk に残す', async () => {
    mockDb.select
      .mockReturnValueOnce(memberSelectChain([{ userId: 'user-1' }]))
      .mockReturnValueOnce(memberSelectChain([{
        displayName: 'ワークスペース名',
        profileDisplayName: 'プロフィール名',
        bio: '折り紙の自己紹介',
        statusMessage: '作業中',
      }]))
      .mockReturnValueOnce(memberSelectChain([{
        category: '作品',
        title: '鶴',
        level: '上級',
        notes: '連鶴も対応',
      }]))

    const { indexMemberChunks } = await import('./functions')
    const handler = indexMemberChunks as unknown as (args: {
      event: { data: { userId: string; workspaceId: string } }
      step: {
        run: (_name: string, fn: () => Promise<unknown>) => Promise<unknown>
      }
    }) => Promise<unknown>
    const step = {
      run: async (_name: string, fn: () => Promise<unknown>) => fn(),
    }

    await handler({
      event: { data: { userId: 'user-1', workspaceId: 'ws-1' } },
      step,
    })

    expect(mockEmbed).toHaveBeenCalledWith({
      model: 'embedding-model',
      value: [
        'メンバー: ワークスペース名',
        'ステータス: 作業中',
        '自己紹介: 折り紙の自己紹介',
        '経験: 作品 / 鶴 / 上級 / 連鶴も対応',
      ].join('\n'),
    })
    expect(mockInsertValues).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      sourceType: 'member',
      sourceId: 'user-1',
      chunkIndex: 0,
      content: [
        'メンバー: ワークスペース名',
        'ステータス: 作業中',
        '自己紹介: 折り紙の自己紹介',
        '経験: 作品 / 鶴 / 上級 / 連鶴も対応',
      ].join('\n'),
      embedding: [0.1, 0.2, 0.3],
    })
    expect(mockDeleteWhere).toHaveBeenCalled()
  })
})
