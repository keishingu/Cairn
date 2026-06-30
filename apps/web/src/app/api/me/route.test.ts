// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockDb, USER_ID } = vi.hoisted(() => {
  const USER_ID = '00000000-0000-0000-0000-000000000001'
  const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
    error: null,
  })
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  }
  return { mockGetAuthContext, mockDb, USER_ID }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'profiles.id' },
  workspaceMembers: {
    userId: 'workspaceMembers.userId',
    workspaceId: 'workspaceMembers.workspaceId',
    status: 'workspaceMembers.status',
    statusAuto: 'workspaceMembers.statusAuto',
    statusMessage: 'workspaceMembers.statusMessage',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('PATCH /api/me の auto presence 更新', () => {
  beforeEach(() => {
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('別 device の手動 busy / away は auto offline で上書きしない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ status: 'busy', statusAuto: false }]))

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'offline', auto: true }),
    }))

    expect(res.status).toBe(200)
    expect(mockDb.update).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({ id: USER_ID, status: 'busy', statusAuto: false })
  })

  it('manual 更新は busy でもそのまま反映する', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mockDb.update.mockReturnValue({ set: updateSet })

    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'offline' }),
    }))

    expect(res.status).toBe(200)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updateSet).toHaveBeenCalledWith({ status: 'offline', statusAuto: false })
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })
})
