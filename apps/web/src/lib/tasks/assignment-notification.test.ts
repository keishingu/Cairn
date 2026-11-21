// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAssignableTaskMember } from './assignment-notification'

const { mockGetWorkspaceRole, mockCanAccessChannel } = vi.hoisted(() => ({
  mockGetWorkspaceRole: vi.fn(),
  mockCanAccessChannel: vi.fn(),
}))

vi.mock('@/lib/access/membership', () => ({
  getWorkspaceRole: mockGetWorkspaceRole,
  isWorkspaceMember: (role: string) => role !== 'guest',
}))
vi.mock('@/lib/permissions', () => ({ canAccessChannel: mockCanAccessChannel }))

describe('isAssignableTaskMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWorkspaceRole.mockResolvedValue('guest')
    mockCanAccessChannel.mockResolvedValue(true)
  })

  it('公開チャンネルを閲覧可能でも未参加のゲストは担当者にできない', async () => {
    mockCanAccessChannel.mockResolvedValue(false)
    await expect(isAssignableTaskMember('workspace', 'guest', null, 'channel')).resolves.toBe(false)
  })

  it('参加済みゲストはチャンネルタスクの担当者にできる', async () => {
    await expect(isAssignableTaskMember('workspace', 'guest', null, 'channel')).resolves.toBe(true)
  })

  it('閲覧のみ（viewer）はチャンネル・プロジェクト・未所属のどのタスクの担当者にもできない', async () => {
    mockGetWorkspaceRole.mockResolvedValue('viewer')
    await expect(isAssignableTaskMember('workspace', 'viewer', null, 'channel')).resolves.toBe(false)
    await expect(isAssignableTaskMember('workspace', 'viewer', 'project', null)).resolves.toBe(false)
    await expect(isAssignableTaskMember('workspace', 'viewer', null, null)).resolves.toBe(false)
    expect(mockCanAccessChannel).not.toHaveBeenCalled()
  })
})
