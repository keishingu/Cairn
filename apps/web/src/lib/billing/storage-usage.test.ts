// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDbTransaction, mockSettleWorkspaceStorageRent, mockOnConflictDoUpdate } = vi.hoisted(() => ({
  mockDbTransaction: vi.fn(),
  mockSettleWorkspaceStorageRent: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  db: { transaction: mockDbTransaction },
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

  it('reconciliationは使用量行をロックしてからfilesを再集計する', async () => {
    const mockSeedOnConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const mockCurrentLimit = vi.fn().mockResolvedValue([{ originalBytes: 100, derivedBytes: 0 }])
    const mockActualWhere = vi.fn().mockResolvedValue([{ originalBytes: '200', derivedBytes: '10' }])
    const mockUsageUpdate = vi.fn()
    const tx = {
      insert: vi.fn()
        .mockReturnValueOnce({
          values: vi.fn(() => ({ onConflictDoNothing: mockSeedOnConflictDoNothing })),
        })
        .mockReturnValueOnce({
          values: vi.fn(() => ({ onConflictDoUpdate: mockUsageUpdate })),
        }),
      select: vi.fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              for: () => ({ limit: mockCurrentLimit }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: mockActualWhere }),
        }),
    }
    mockDbTransaction.mockImplementation(async (callback) => callback(tx))

    const { reconcileWorkspaceStorageUsage } = await import('./storage-usage')
    await reconcileWorkspaceStorageUsage('workspace-1')

    expect(mockCurrentLimit.mock.invocationCallOrder[0]!).toBeLessThan(
      mockActualWhere.mock.invocationCallOrder[0]!,
    )
    expect(mockSettleWorkspaceStorageRent).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      expect.any(Date),
    )
  })
})
