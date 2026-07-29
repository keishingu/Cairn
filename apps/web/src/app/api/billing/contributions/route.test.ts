// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockOrderBy,
  mockLedgerLimit,
  mockPlacementReturning,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLedgerLimit: vi.fn(),
  mockPlacementReturning: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: () => true }))
vi.mock('@cairn/db', () => ({
  creditLedger: {
    id: 'ledger.id',
    workspaceId: 'ledger.workspaceId',
    reason: 'ledger.reason',
    delta: 'ledger.delta',
    createdAt: 'ledger.createdAt',
  },
  creditPlacements: {
    id: 'placement.id',
    workspaceId: 'placement.workspaceId',
    ledgerId: 'placement.ledgerId',
    x: 'placement.x',
    y: 'placement.y',
    rotation: 'placement.rotation',
    shape: 'placement.shape',
    placedAt: 'placement.placedAt',
  },
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ orderBy: mockOrderBy }) }),
        where: () => ({ orderBy: mockOrderBy }),
      }),
    }),
    transaction: mockTransaction,
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  asc: vi.fn(() => 'asc'),
  eq: vi.fn(() => 'eq'),
  gt: vi.fn(() => 'gt'),
  inArray: vi.fn(() => 'inArray'),
  isNull: vi.fn(() => 'isNull'),
}))

describe('/api/billing/contributions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: {
        userId: '4e623381-66e0-4a69-b17d-12ef3dc7f75f',
        workspaceId: 'workspace-1',
        role: 'member',
      },
      error: null,
    })
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        select: () => ({
          from: () => ({ where: () => ({ limit: mockLedgerLimit }) }),
        }),
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: mockPlacementReturning }),
          }),
        }),
      }),
    )
  })

  it('配置済みと未配置の確定付与を分けて返す', async () => {
    mockOrderBy
      .mockResolvedValueOnce([
        {
          id: 'placement-1',
          ledgerId: '4d74e011-8c5d-4884-b5e2-0cf78ab34f63',
          x: '0.500000',
          y: '0.750000',
          rotation: '0.100000',
          shape: 'regular',
          placedAt: new Date('2026-07-25T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '6b4913e7-36f2-4cb7-8d36-8afd99fbc19d',
          createdAt: new Date('2026-07-26T00:00:00.000Z'),
        },
      ])

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      billingEnabled: true,
      placements: [
        {
          id: 'placement-1',
          ledgerId: '4d74e011-8c5d-4884-b5e2-0cf78ab34f63',
          x: 0.5,
          y: 0.75,
          rotation: 0.1,
          shape: 'regular',
          placedAt: '2026-07-25T00:00:00.000Z',
        },
      ],
      pending: [
        { ledgerId: '6b4913e7-36f2-4cb7-8d36-8afd99fbc19d', createdAt: '2026-07-26T00:00:00.000Z' },
      ],
    })
  })

  it('対象外の台帳行は配置せず conflict として返す', async () => {
    mockLedgerLimit.mockResolvedValue([{ reason: 'storage_rent', delta: -1 }])

    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://cairn.example/api/billing/contributions', {
        method: 'POST',
        body: JSON.stringify({
          ledgerId: '4d74e011-8c5d-4884-b5e2-0cf78ab34f63',
          x: 0.5,
          y: 0.75,
          rotation: 0,
          shape: 'organic',
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(mockPlacementReturning).not.toHaveBeenCalled()
  })

  it('同じ付与が同時に配置済みになった場合も conflict として返す', async () => {
    mockLedgerLimit.mockResolvedValue([{ reason: 'subscription_grant', delta: 1 }])
    mockPlacementReturning.mockResolvedValue([])

    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://cairn.example/api/billing/contributions', {
        method: 'POST',
        body: JSON.stringify({
          ledgerId: '4d74e011-8c5d-4884-b5e2-0cf78ab34f63',
          x: 0.5,
          y: 0.75,
          rotation: 0,
          shape: 'organic',
        }),
      }),
    )

    expect(response.status).toBe(409)
  })
})
