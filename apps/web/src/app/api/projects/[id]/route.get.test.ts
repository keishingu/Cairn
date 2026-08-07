// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'
const PROJECT_ID = '00000000-0000-0000-0000-000000000100'
const CHANNEL_ID = '00000000-0000-0000-0000-000000000200'

const { mockGetAuthContext, mockRequireProjectAccess, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
      role: 'member',
    },
    error: null,
  }),
  mockRequireProjectAccess: vi.fn().mockResolvedValue(null),
  mockDb: { select: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  requireRole: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: {
    id: 'channels.id',
    projectId: 'channels.projectId',
    type: 'channels.type',
    milestoneId: 'channels.milestoneId',
  },
  projects: {
    id: 'projects.id',
    workspaceId: 'projects.workspaceId',
    title: 'projects.title',
    description: 'projects.description',
    startDate: 'projects.startDate',
    endDate: 'projects.endDate',
    archived: 'projects.archived',
    coverPhotoUrl: 'projects.coverPhotoUrl',
    location: 'projects.location',
    placeId: 'projects.placeId',
  },
  projectStatuses: {
    id: 'projectStatuses.id',
    name: 'projectStatuses.name',
    color: 'projectStatuses.color',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  inArray: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(
    vi.fn(() => 'sql'),
    { raw: vi.fn() },
  ),
}))

function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['from', 'leftJoin', 'where', 'limit']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  return chain
}

describe('GET /api/projects/[id]', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireProjectAccess.mockResolvedValue(null)
  })

  it('Generalチャンネルだけをプロジェクトの投稿先として返す', async () => {
    const chain = selectChain([
      {
        id: PROJECT_ID,
        title: 'テストプロジェクト',
        description: null,
        statusName: null,
        statusColor: null,
        startDate: null,
        endDate: null,
        archived: false,
        channelId: CHANNEL_ID,
        coverPhotoUrl: null,
        location: null,
        placeId: null,
      },
    ])
    mockDb.select.mockReturnValueOnce(chain)

    const drizzle = await import('drizzle-orm')
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ channelId: CHANNEL_ID })
    expect(drizzle.isNull).toHaveBeenCalledWith('channels.milestoneId')
  })
})
