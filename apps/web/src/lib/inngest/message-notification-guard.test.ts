// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}))

const { mockLockActiveMembership } = vi.hoisted(() => ({
  mockLockActiveMembership: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: {
    transaction: mockTransaction,
  },
}))

vi.mock('drizzle-orm', () => ({ sql: vi.fn(() => 'guard-query') }))
vi.mock('@/lib/access/active-membership-lock', () => ({
  lockActiveMembership: mockLockActiveMembership,
}))

describe('メッセージ通知の送信元ガード', () => {
  afterEach(() => vi.clearAllMocks())

  it('送信者がactiveでメッセージが未削除ならロック中に処理する', async () => {
    mockExecute.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    mockLockActiveMembership.mockResolvedValue(true)
    mockTransaction.mockImplementation((callback) => callback({ execute: mockExecute }))
    const action = vi.fn().mockResolvedValue('sent')

    const { runForActiveMessageSender } = await import('./message-notification-guard')
    await expect(
      runForActiveMessageSender('message-1', 'workspace-1', 'user-1', action),
    ).resolves.toBe('sent')
    expect(action).toHaveBeenCalledOnce()
  })

  it('退会済みまたは削除済みなら通知処理を呼ばない', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    mockLockActiveMembership.mockResolvedValue(false)
    mockTransaction.mockImplementation((callback) => callback({ execute: mockExecute }))
    const action = vi.fn()

    const { runForActiveMessageSender } = await import('./message-notification-guard')
    await expect(
      runForActiveMessageSender('message-1', 'workspace-1', 'user-1', action),
    ).resolves.toBeNull()
    expect(action).not.toHaveBeenCalled()
  })
})
