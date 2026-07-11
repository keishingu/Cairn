// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateFunction,
  mockInsertValues,
  mockSendPushToUser,
  mockDb,
} = vi.hoisted(() => {
  const mockCreateFunction = vi.fn((_opts: unknown, _trigger: unknown, handler: unknown) => handler)
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockSendPushToUser = vi.fn().mockResolvedValue(undefined)
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  }

  return {
    mockCreateFunction,
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

vi.mock('@cairn/db', () => ({
  db: mockDb,
  notifications: {},
  profiles: {
    id: 'profiles.id',
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
