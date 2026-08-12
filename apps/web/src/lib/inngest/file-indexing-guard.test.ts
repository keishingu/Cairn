// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLimit, mockLockActiveMembership } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockLockActiveMembership: vi.fn(),
}))

vi.mock('@/lib/access/active-membership-lock', () => ({
  lockActiveMembership: mockLockActiveMembership,
}))
vi.mock('@cairn/db', () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: mockLimit,
              for: () => ({ limit: mockLimit }),
            }),
          }),
        }),
      }),
  },
  files: {},
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))

describe('runForActiveFileUploader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('元fileとactive uploaderが存在する場合だけ保存する', async () => {
    mockLimit
      .mockResolvedValueOnce([{ uploadedBy: 'user-1' }])
      .mockResolvedValueOnce([{ id: 'file-1' }])
    mockLockActiveMembership.mockResolvedValue(true)
    const action = vi.fn().mockResolvedValue('saved')
    const { runForActiveFileUploader } = await import('./file-indexing-guard')

    await expect(runForActiveFileUploader('file-1', 'workspace-1', action)).resolves.toBe('saved')
    expect(action).toHaveBeenCalledOnce()
  })

  it('退会処理で元fileが消えていれば保存しない', async () => {
    mockLimit.mockResolvedValue([])
    const action = vi.fn()
    const { runForActiveFileUploader } = await import('./file-indexing-guard')

    await expect(runForActiveFileUploader('file-1', 'workspace-1', action)).resolves.toBeNull()
    expect(action).not.toHaveBeenCalled()
  })
})
