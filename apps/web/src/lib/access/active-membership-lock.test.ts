// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { lockActiveMembership } from './active-membership-lock'

vi.mock('drizzle-orm', () => ({ sql: vi.fn(() => 'lock-query') }))

describe('active membershipの共有ロック', () => {
  it('active行をロックできた場合だけtrueを返す', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    await expect(lockActiveMembership({ execute } as never, 'workspace-1', 'user-1')).resolves.toBe(
      true,
    )
  })

  it('退会済みならfalseを返す', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    await expect(lockActiveMembership({ execute } as never, 'workspace-1', 'user-1')).resolves.toBe(
      false,
    )
  })
})
