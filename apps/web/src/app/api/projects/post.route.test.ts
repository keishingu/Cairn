// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '00000000-0000-0000-0000-000000000099'

const { mockGetAuthContext, mockRequireWorkspaceAdmin, mockDb } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
    },
    error: null,
  })
  const mockRequireWorkspaceAdmin = vi.fn().mockResolvedValue(null)
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
  }
  return { mockGetAuthContext, mockRequireWorkspaceAdmin, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireWorkspaceAdmin: mockRequireWorkspaceAdmin }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects: {
    id: 'p.id',
    workspaceId: 'p.workspaceId',
    title: 'p.title',
    description: 'p.description',
    statusId: 'p.statusId',
    startDate: 'p.startDate',
    endDate: 'p.endDate',
    coverPhotoUrl: 'p.coverPhotoUrl',
    location: 'p.location',
    placeId: 'p.placeId',
    createdBy: 'p.createdBy',
  },
  channels: {
    workspaceId: 'c.workspaceId',
    projectId: 'c.projectId',
    type: 'c.type',
  },
  projectStatuses: {
    id: 'ps.id',
    name: 'ps.name',
    color: 'ps.color',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

describe('POST /api/projects', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
  })

  it('作成者を project_members に自動追加しない', async () => {
    let insertCount = 0

    mockDb.insert.mockImplementation(() => {
      insertCount += 1

      if (insertCount === 1) {
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: PROJECT_ID,
              title: '新規プロジェクト',
              description: null,
              startDate: null,
              endDate: null,
              coverPhotoUrl: null,
              location: null,
            }]),
          }),
        }
      }

      return {
        values: vi.fn().mockResolvedValue(undefined),
      }
    })

    const { POST } = await import('./route')
    const res = await POST(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '新規プロジェクト',
      }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { memberCount: number; isMember: boolean }
    expect(body.memberCount).toBe(0)
    expect(body.isMember).toBe(false)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })
})
