// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockSet } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockSet: vi.fn(() => ({ where: vi.fn() })),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))
vi.mock('@cairn/db', () => {
  const tx = { update: vi.fn(() => ({ set: mockSet })) }
  return {
    aiNudges: { userId: 'aiNudges.userId', status: 'aiNudges.status' },
    profiles: { id: 'profiles.id' },
    workspaceMembers: {
      userId: 'workspaceMembers.userId',
      workspaceId: 'workspaceMembers.workspaceId',
    },
    db: {
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
    },
  }
})

describe('PATCH /api/me', () => {
  afterEach(() => vi.clearAllMocks())

  it('AIナッジOFF時もdismissedのremindAfterを保持する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aiNudgesEnabled: false }),
    }))

    expect(response.status).toBe(200)
    expect(mockSet).toHaveBeenNthCalledWith(2, { status: 'suppressed', remindAfter: null })
    expect(mockSet).toHaveBeenNthCalledWith(3, { status: 'suppressed' })
  })

  it('テーマとハイライトカラーをプロフィールへ保存する', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
      error: null,
    })

    const { PATCH } = await import('./route')
    const response = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'dark', accentId: 'violet' }),
    }))

    expect(response.status).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      theme: 'dark',
      accentId: 'violet',
      updatedAt: expect.any(Date),
    }))
    await expect(response.json()).resolves.toEqual({
      id: USER_ID,
      theme: 'dark',
      accentId: 'violet',
    })
  })
})
