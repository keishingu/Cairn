// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOnConflictDoUpdate, mockValues, mockInsert } = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }))
  const mockInsert = vi.fn(() => ({ values: mockValues }))
  return { mockOnConflictDoUpdate, mockValues, mockInsert }
})

vi.mock('@cairn/db', () => ({
  db: { insert: mockInsert },
  workspaceStorageUsage: { workspaceId: 'wsu.workspaceId', originalBytes: 'wsu.originalBytes' },
}))
vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

describe('adjustStorageUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('差分が0の場合は何もしない', async () => {
    const { adjustStorageUsage } = await import('./storage-usage')
    await adjustStorageUsage('ws-1', 0)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('正の差分を workspace_storage_usage に upsert する', async () => {
    const { adjustStorageUsage } = await import('./storage-usage')
    await adjustStorageUsage('ws-1', 500)

    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith({ workspaceId: 'ws-1', originalBytes: 500 })
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: 'wsu.workspaceId',
    }))
  })

  it('負の差分（削除時）でも insert 側の初期値は0未満にならない', async () => {
    const { adjustStorageUsage } = await import('./storage-usage')
    await adjustStorageUsage('ws-1', -500)

    // 既存行があれば onConflictDoUpdate 側の SQL 式が実際の減算を行う。
    // insert 側の初期値（行が存在しない場合のフォールバック）は負値にしない。
    expect(mockValues).toHaveBeenCalledWith({ workspaceId: 'ws-1', originalBytes: 0 })
  })
})
