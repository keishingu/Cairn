// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import {
  lockActiveMembership,
  lockActiveMemberships,
  runForActiveMembership,
} from './active-membership-lock'

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(vi.fn(() => 'lock-query'), { join: vi.fn(() => 'joined-ids') }),
}))

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

  it('全受信者をロックできた場合だけtrueを返す', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ userId: 'user-1' }] })
    await expect(
      lockActiveMemberships(
        { execute } as never,
        'workspace-1',
        ['user-2', 'user-1'],
      ),
    ).resolves.toBe(false)
  })

  it('active membershipがある間だけactionを実行する', async () => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [{}] }) }
    const client = { transaction: vi.fn((callback) => callback(tx)) }
    const action = vi.fn().mockResolvedValue('done')

    await expect(
      runForActiveMembership(client as never, 'workspace-1', 'user-1', action),
    ).resolves.toBe('done')
    expect(action).toHaveBeenCalledWith(tx)
  })

  it('退会済みならactionを実行しない', async () => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    const client = { transaction: vi.fn((callback) => callback(tx)) }
    const action = vi.fn()

    await expect(
      runForActiveMembership(client as never, 'workspace-1', 'user-1', action),
    ).resolves.toBeNull()
    expect(action).not.toHaveBeenCalled()
  })
})
