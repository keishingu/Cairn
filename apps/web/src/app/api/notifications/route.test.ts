// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'

const {
  mockGetAuthContext,
  mockNe,
  mockIsNull,
  mockCount,
  mockSelectWhere,
  mockWhere,
  mockReturning,
  mockDb,
} = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn()
  const mockNe = vi.fn(() => 'not-dm')
  const mockIsNull = vi.fn(() => 'is-null')
  const mockCount = vi.fn(() => 'count')
  const mockSelectWhere = vi.fn().mockResolvedValue([{ count: 73 }])
  const mockWhere = vi.fn()
  const mockReturning = vi.fn().mockResolvedValue([{ id: 'notification-1' }])
  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelectWhere,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mockWhere.mockReturnValue({ returning: mockReturning }),
      })),
    })),
  }
  return {
    mockGetAuthContext,
    mockNe,
    mockIsNull,
    mockCount,
    mockSelectWhere,
    mockWhere,
    mockReturning,
    mockDb,
  }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  notifications: {
    id: 'notifications.id',
    type: 'notifications.type',
    userId: 'notifications.userId',
    workspaceId: 'notifications.workspaceId',
    readAt: 'notifications.readAt',
    data: 'notifications.data',
    createdAt: 'notifications.createdAt',
  },
  aiNudges: {
    id: 'aiNudges.id',
    workspaceId: 'aiNudges.workspaceId',
    userId: 'aiNudges.userId',
    detector: 'aiNudges.detector',
  },
  workspaces: {
    id: 'workspaces.id',
    aiNudgesPhaseOneEnabled: 'workspaces.aiNudgesPhaseOneEnabled',
    aiNudgesPhaseTwoEnabled: 'workspaces.aiNudgesPhaseTwoEnabled',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  ne: mockNe,
  and: vi.fn((...conditions: unknown[]) => conditions),
  isNull: mockIsNull,
  inArray: vi.fn(() => 'in-array'),
  count: mockCount,
  desc: vi.fn(() => 'desc'),
  sql: vi.fn(() => 'ai-filter'),
}))

import { GET, PATCH } from './route'

const originalDmFlag = FEATURE_FLAGS.dm

describe('GET /api/notifications', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('未読通知数は50件の一覧上限を使わず集計結果を返す', async () => {
    const response = await GET(
      new Request('http://localhost/api/notifications?filter=unread&count=1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ count: 73 })
    expect(mockCount).toHaveBeenCalledOnce()
    expect(mockIsNull).toHaveBeenCalledWith('notifications.readAt')
    expect(mockSelectWhere).toHaveBeenCalled()
  })
})

describe('PATCH /api/notifications', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
  })

  afterEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = originalDmFlag
    vi.clearAllMocks()
  })

  it('DMが無効なとき、すべて既読の対象からDM通知を除外する', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false

    const response = await PATCH(
      new Request('http://localhost/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ updated: 1 })
    expect(mockNe).toHaveBeenCalledWith('notifications.type', 'dm')
    expect(mockWhere).toHaveBeenCalledWith(expect.arrayContaining(['not-dm']))
  })

  it('DMが有効なとき、すべて既読に種別条件を追加しない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true

    await PATCH(
      new Request('http://localhost/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(mockNe).not.toHaveBeenCalled()
  })
})
