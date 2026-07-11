// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockGetWorkspaceRole,
  mockGetGuestVisibleProjectIds,
  mockSelect,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetWorkspaceRole: vi.fn(),
  mockGetGuestVisibleProjectIds: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  getWorkspaceRole: mockGetWorkspaceRole,
  getGuestVisibleProjectIds: mockGetGuestVisibleProjectIds,
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockSelect },
  notifications: {
    userId: 'notifications.userId',
    workspaceId: 'notifications.workspaceId',
    readAt: 'notifications.readAt',
    createdAt: 'notifications.createdAt',
    type: 'notifications.type',
  },
  channels: {
    id: 'channels.id',
    projectId: 'channels.projectId',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args) => ({ op: 'eq', args })),
  isNull: vi.fn((...args) => ({ op: 'isNull', args })),
  and: vi.fn((...args) => ({ op: 'and', args })),
  desc: vi.fn((arg) => ({ op: 'desc', arg })),
  inArray: vi.fn((...args) => ({ op: 'inArray', args })),
}))

function selectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(result),
        }),
      }),
    }),
  }
}

function channelSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('GET /api/notifications の guest スコープ', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceRole.mockResolvedValue('guest')
    mockGetGuestVisibleProjectIds.mockResolvedValue(['project-visible'])
  })

  afterEach(() => vi.clearAllMocks())

  it('projectId を解決できない旧 task 通知を guest には返さない', async () => {
    mockSelect
      .mockReturnValueOnce(selectChain([
        {
          id: 'task-legacy',
          type: 'task',
          title: 'task',
          body: 'legacy',
          data: { assignerName: 'alice', projectTitle: 'secret' },
          readAt: null,
          createdAt: new Date('2026-07-10T00:00:00Z'),
        },
        {
          id: 'task-visible',
          type: 'task',
          title: 'task',
          body: 'visible',
          data: { projectId: 'project-visible', projectTitle: 'open' },
          readAt: null,
          createdAt: new Date('2026-07-10T00:01:00Z'),
        },
      ]))
      .mockReturnValueOnce(channelSelectChain([]))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/notifications'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([
      {
        id: 'task-visible',
        type: 'task',
        title: 'task',
        body: 'visible',
        data: { projectId: 'project-visible', projectTitle: 'open' },
        readAt: null,
        createdAt: '2026-07-10T00:01:00.000Z',
      },
    ])
  })
})
