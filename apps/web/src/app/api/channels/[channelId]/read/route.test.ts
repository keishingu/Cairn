// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockLockActiveMembership,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockLockActiveMembership: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  lockActiveMembership: mockLockActiveMembership,
}))
vi.mock('@cairn/db', () => ({
  db: { transaction: mockTransaction },
  channelReadStates: {},
  channels: {},
  messages: {},
  notifications: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

describe('POST /api/channels/[channelId]/read', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    mockRequireChannelAccess.mockResolvedValue(null)
    mockLockActiveMembership.mockResolvedValue(false)
    mockTransaction.mockImplementation(async callback => callback({}))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('退会済みなら既読状態を書き込まない', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/', { method: 'POST' }), {
      params: Promise.resolve({ channelId: CHANNEL_ID }),
    })

    expect(response.status).toBe(403)
    expect(mockLockActiveMembership).toHaveBeenCalledWith({}, WORKSPACE_ID, USER_ID)
  })
})
