// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAssignableTaskMember } from './assignment-notification'

const { mockGetWorkspaceRole, mockCanAccessChannel, mockLimit } = vi.hoisted(() => ({
  mockGetWorkspaceRole: vi.fn(),
  mockCanAccessChannel: vi.fn(),
  mockLimit: vi.fn(),
}))

vi.mock('@/lib/access/membership', () => ({
  getWorkspaceRole: mockGetWorkspaceRole,
  isWorkspaceMember: (role: string) => role !== 'guest',
}))
vi.mock('@/lib/permissions', () => ({ canAccessChannel: mockCanAccessChannel }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))
vi.mock('@cairn/db', () => ({
  channelMembers: { channelId: 'channelId', userId: 'userId' },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: mockLimit })) })),
    })),
  },
}))

describe('isAssignableTaskMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWorkspaceRole.mockResolvedValue('guest')
    mockCanAccessChannel.mockResolvedValue(true)
  })

  it('公開チャンネルを閲覧可能でも未参加のゲストは担当者にできない', async () => {
    mockLimit.mockResolvedValue([])
    await expect(isAssignableTaskMember('workspace', 'guest', null, 'channel')).resolves.toBe(false)
  })

  it('参加済みゲストはチャンネルタスクの担当者にできる', async () => {
    mockLimit.mockResolvedValue([{ userId: 'guest' }])
    await expect(isAssignableTaskMember('workspace', 'guest', null, 'channel')).resolves.toBe(true)
  })
})
