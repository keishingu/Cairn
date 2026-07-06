// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateFunction,
  mockSendPushToUser,
  mockDb,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn((_: unknown, __: unknown, handler: unknown) => handler),
  mockSendPushToUser: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}))

vi.mock('./client', () => ({
  inngest: {
    createFunction: mockCreateFunction,
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/ai/extract-text', () => ({
  isIndexable: vi.fn(() => true),
}))

vi.mock('@/lib/push/send', () => ({
  sendPushToUser: mockSendPushToUser,
}))

vi.mock('@/lib/push/suppress', () => ({
  hasReadMessage: vi.fn(() => false),
}))

vi.mock('@/lib/chat/mentions', () => ({
  extractMentionIds: vi.fn(() => []),
  stripMentionsToText: vi.fn((value: string) => value),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    userId: 'wm.userId',
    workspaceId: 'wm.workspaceId',
    membershipStatus: 'wm.membershipStatus',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('onTaskAssigned', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('inactive な assignee には通知を作らず push もしない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { onTaskAssigned } = await import('./functions')
    const handler = onTaskAssigned as unknown as (input: {
      event: { data: Record<string, string> }
      step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> }
    }) => Promise<unknown>
    const step = { run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()) }

    const result = await handler({
      event: {
        data: {
          taskId: 'task-1',
          taskTitle: 'task',
          assigneeId: 'user-2',
          projectId: 'project-1',
          projectTitle: 'project',
          workspaceId: 'ws-1',
          assignerName: 'assigner',
        },
      },
      step,
    })

    expect(result).toEqual({ notified: null, skippedInactive: true })
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })
})
