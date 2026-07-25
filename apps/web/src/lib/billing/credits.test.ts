// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsBillingEnabled } = vi.hoisted(() => ({
  mockIsBillingEnabled: vi.fn(),
}))

vi.mock('@cairn/db', () => ({
  creditLedger: { workspaceId: 'creditLedger.workspaceId', delta: 'creditLedger.delta' },
  db: { transaction: vi.fn() },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  sql: vi.fn(() => 'sql'),
}))
vi.mock('./is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))

describe('consumeCreditsForPassiveBenefit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsBillingEnabled.mockReturnValue(true)
  })

  it('課金無効環境では台帳を変更せずに許可する', async () => {
    mockIsBillingEnabled.mockReturnValue(false)
    const tx = { execute: vi.fn(), select: vi.fn(), insert: vi.fn() }

    const { consumeCreditsForPassiveBenefit } = await import('./credits')
    await expect(
      consumeCreditsForPassiveBenefit(tx as never, {
        workspaceId: 'workspace-1',
        credits: 10,
        refId: 'heartbeat:nudge-1',
      }),
    ).resolves.toBe(true)

    expect(tx.execute).not.toHaveBeenCalled()
    expect(tx.insert).not.toHaveBeenCalled()
  })

  it('必要クレジット未満では配信を許可しない', async () => {
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => ({ from: () => ({ where: async () => [{ balance: '9' }] }) })),
      insert: vi.fn(),
    }

    const { consumeCreditsForPassiveBenefit } = await import('./credits')
    await expect(
      consumeCreditsForPassiveBenefit(tx as never, {
        workspaceId: 'workspace-1',
        credits: 10,
        refId: 'heartbeat:nudge-1',
      }),
    ).resolves.toBe(false)

    expect(tx.insert).not.toHaveBeenCalled()
  })

  it('必要クレジットちょうどなら台帳へ消費を記帳する', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => ({ from: () => ({ where: async () => [{ balance: '10' }] }) })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ onConflictDoNothing })),
      })),
    }

    const { consumeCreditsForPassiveBenefit } = await import('./credits')
    await expect(
      consumeCreditsForPassiveBenefit(tx as never, {
        workspaceId: 'workspace-1',
        credits: 10,
        refId: 'heartbeat:nudge-1',
      }),
    ).resolves.toBe(true)

    expect(tx.insert).toHaveBeenCalled()
    expect(onConflictDoNothing).toHaveBeenCalled()
  })
})
