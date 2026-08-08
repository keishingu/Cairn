// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FILE_FILTER_CONDITIONS } from '@/lib/files/saved-file-filter'

const { mockGetAuthContext, mockDb, mockEq, state } = vi.hoisted(() => {
  const state = { rows: [] as unknown[], inserted: [] as unknown[] }
  const mockGetAuthContext = vi.fn()
  const mockEq = vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] }))
  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn(async () => state.rows),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: unknown) => {
        state.inserted.push(value)
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn(async () => state.rows),
          }),
        }
      }),
    })),
  }
  return { mockGetAuthContext, mockDb, mockEq, state }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  savedFileFilters: {
    id: 'savedFileFilters.id',
    workspaceId: 'savedFileFilters.workspaceId',
    userId: 'savedFileFilters.userId',
    createdAt: 'savedFileFilters.createdAt',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  asc: vi.fn((value: unknown) => ({ asc: value })),
  eq: mockEq,
}))

import { GET, POST } from './route'

describe('/api/files/filters', () => {
  beforeEach(() => {
    state.rows = []
    state.inserted = []
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    vi.clearAllMocks()
  })

  it('ユーザーとワークスペースの両方で保存済みフィルターを絞り込む', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('savedFileFilters.workspaceId', 'workspace-1')
    expect(mockEq).toHaveBeenCalledWith('savedFileFilters.userId', 'user-1')
  })

  it('フィルターをユーザーとワークスペースに紐付けて保存する', async () => {
    state.rows = [
      {
        id: 'filter-1',
        name: '計画書',
        conditions: DEFAULT_FILE_FILTER_CONDITIONS,
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
        updatedAt: new Date('2026-08-08T00:00:00.000Z'),
      },
    ]
    const response = await POST(
      new Request('http://localhost/api/files/filters', {
        method: 'POST',
        body: JSON.stringify({ name: '計画書', conditions: DEFAULT_FILE_FILTER_CONDITIONS }),
      }),
    )

    expect(response.status).toBe(201)
    expect(state.inserted).toContainEqual(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        name: '計画書',
      }),
    )
  })

  it('不正な日付範囲は保存しない', async () => {
    const response = await POST(
      new Request('http://localhost/api/files/filters', {
        method: 'POST',
        body: JSON.stringify({
          name: '不正な期間',
          conditions: { createdFrom: '2026-08-10', createdTo: '2026-08-09' },
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
