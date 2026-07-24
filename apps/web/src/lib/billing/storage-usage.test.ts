// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSettleWorkspaceStorageRent, mockOnConflictDoUpdate } = vi.hoisted(() => ({
  mockSettleWorkspaceStorageRent: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: {},
  files: {},
  workspaces: {},
  workspaceStorageUsage: {
    workspaceId: 'usage.workspaceId',
    originalBytes: 'usage.originalBytes',
    derivedBytes: 'usage.derivedBytes',
  },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))
vi.mock('./is-billing-enabled', () => ({ isBillingEnabled: () => true }))
vi.mock('./storage-rent', () => ({
  settleWorkspaceStorageRent: mockSettleWorkspaceStorageRent,
}))

describe('recordStorageUsageDelta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettleWorkspaceStorageRent.mockResolvedValue({ debitedCredits: 0 })
  })

  it('容量変更前に古い容量の家賃を同一トランザクションで精算する', async () => {
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate })),
      })),
    }

    const { recordStorageUsageDelta } = await import('./storage-usage')
    await recordStorageUsageDelta('workspace-1', { originalBytes: 100, derivedBytes: 0 }, tx as never)

    expect(mockSettleWorkspaceStorageRent).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      expect.any(Date),
    )
    expect(tx.insert).toHaveBeenCalled()
  })
})
