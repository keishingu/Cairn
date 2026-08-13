// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS } from '@cairn/shared'
import { GET, POST } from './route'
import { getAuthContext } from '@/lib/get-auth-context'

const mockTransaction = vi.hoisted(() => vi.fn())
const mockLockActiveMemberships = vi.hoisted(() => vi.fn())

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(),
}))
vi.mock('@/lib/access/active-membership-lock', () => ({
  lockActiveMemberships: mockLockActiveMemberships,
}))
vi.mock('@cairn/db', () => ({
  db: { transaction: mockTransaction },
  channels: { id: 'channels.id', workspaceId: 'channels.workspaceId', type: 'channels.type' },
  channelMembers: { channelId: 'channelMembers.channelId', userId: 'channelMembers.userId' },
  channelReadStates: {},
}))

const originalDmFlag = FEATURE_FLAGS.dm

describe('/api/workspaces/dms', () => {
  beforeEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = false
  })

  afterEach(() => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = originalDmFlag
    vi.clearAllMocks()
  })

  it('feature flag が無効なら一覧取得を認証前に 404 にする', async () => {
    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'DM機能は現在利用できません' })
    expect(getAuthContext).not.toHaveBeenCalled()
  })

  it('feature flag が無効なら作成を認証前に 404 にする', async () => {
    const response = await POST(new Request('http://localhost/api/workspaces/dms', { method: 'POST' }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'DM機能は現在利用できません' })
    expect(getAuthContext).not.toHaveBeenCalled()
  })

  it('退会済みの参加者がいればDMを作成できない', async () => {
    ;(FEATURE_FLAGS as { dm: boolean }).dm = true
    vi.mocked(getAuthContext).mockResolvedValue({
      ctx: {
        userId: '00000000-0000-0000-0000-000000000001',
        workspaceId: '10000000-0000-0000-0000-000000000001',
        role: 'member',
      },
      error: null,
    })
    mockLockActiveMemberships.mockResolvedValue(false)
    const tx = {}
    mockTransaction.mockImplementation(async callback => callback(tx))

    const response = await POST(
      new Request('http://localhost/api/workspaces/dms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: '20000000-0000-0000-0000-000000000001' }),
      }),
    )

    expect(response.status).toBe(422)
    expect(mockLockActiveMemberships).toHaveBeenCalledWith(
      tx,
      '10000000-0000-0000-0000-000000000001',
      [
        '00000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
      ],
    )
  })
})
