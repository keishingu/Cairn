// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyTaskAssigned } from './assignment-notification'

const { mockInngestSend } = vi.hoisted(() => ({ mockInngestSend: vi.fn() }))

vi.mock('@cairn/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => Promise.resolve([{ displayName: '割当者' }]) }),
      }),
    }),
  },
  profiles: {},
  workspaceMembers: {},
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => 'and'), eq: vi.fn(() => 'eq') }))
vi.mock('@/lib/workspace-member-display-name', () => ({
  workspaceMemberDisplayName: vi.fn(() => 'display-name'),
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))

describe('notifyTaskAssigned', () => {
  beforeEach(() => vi.clearAllMocks())

  it('退会時に通知元を特定できるassignerIdをイベントへ含める', async () => {
    await notifyTaskAssigned({
      workspaceId: 'workspace-1',
      assignerId: 'assigner-1',
      assigneeId: 'assignee-1',
      taskId: 'task-1',
      taskTitle: '登山計画',
      projectId: 'project-1',
      projectTitle: '夏山',
    })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'task/assigned',
        data: expect.objectContaining({ assignerId: 'assigner-1', assignerName: '割当者' }),
      }),
    )
  })
})
