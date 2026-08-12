// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { hasAccountLifecycleSchema, lockUsableAccount } from './account-lifecycle-lock'

vi.mock('drizzle-orm', () => ({ sql: vi.fn(() => 'sql') }))

describe('lockUsableAccount', () => {
  it('退会未開始のプロフィールを共有ロックできる', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    await expect(lockUsableAccount({ execute } as never, 'user-1')).resolves.toBe(true)
  })

  it('退会開始済みまたは存在しないプロフィールを拒否する', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    await expect(lockUsableAccount({ execute } as never, 'user-1')).resolves.toBe(false)
  })
})

describe('hasAccountLifecycleSchema', () => {
  it('退会状態カラムの有無を返す', async () => {
    const ready = vi.fn().mockResolvedValue({ rows: [{ ready: true }] })
    const missing = vi.fn().mockResolvedValue({ rows: [{ ready: false }] })
    await expect(hasAccountLifecycleSchema({ execute: ready } as never)).resolves.toBe(true)
    await expect(hasAccountLifecycleSchema({ execute: missing } as never)).resolves.toBe(false)
  })
})
