// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockGetWorkspaceRole,
  mockStripePriceRetrieve,
  mockStripeSessionsList,
  mockStripeSessionsCreate,
  mockStripeSessionsExpire,
  mockSelectLimit,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetWorkspaceRole: vi.fn(),
  mockStripePriceRetrieve: vi.fn(),
  mockStripeSessionsList: vi.fn(),
  mockStripeSessionsCreate: vi.fn(),
  mockStripeSessionsExpire: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/access/membership', () => ({ getWorkspaceRole: mockGetWorkspaceRole }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: () => true }))
vi.mock('@/lib/billing/stripe', () => ({
  getCreditPackPriceId: () => 'price_credit_pack',
  getStripeClient: () => ({
    prices: { retrieve: mockStripePriceRetrieve },
    checkout: {
      sessions: {
        create: mockStripeSessionsCreate,
        expire: mockStripeSessionsExpire,
        list: mockStripeSessionsList,
      },
    },
  }),
  resolveApplicationUrl: () => 'https://cairn.example',
}))
vi.mock('@cairn/db', () => ({
  billingCustomers: { userId: 'bc.userId', stripeCustomerId: 'bc.stripeCustomerId' },
  subscriptions: {
    id: 's.id',
    workspaceId: 's.workspaceId',
    supporterUserId: 's.supporterUserId',
    plan: 's.plan',
    status: 's.status',
    currentPeriodEnd: 's.currentPeriodEnd',
  },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
    transaction: mockTransaction,
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  gt: vi.fn(() => 'gt'),
  sql: vi.fn(() => 'sql'),
}))

describe('POST /api/billing/credit-packs/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    mockGetWorkspaceRole.mockResolvedValue('member')
    mockStripePriceRetrieve.mockResolvedValue({
      active: true,
      currency: 'jpy',
      type: 'one_time',
      unit_amount: 500,
    })
    mockStripeSessionsList.mockResolvedValue({ data: [] })
    mockStripeSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' })
    mockStripeSessionsExpire.mockResolvedValue({})
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        execute: vi.fn().mockResolvedValue(undefined),
        select: () => ({
          from: () => ({
            where: () => ({ limit: mockSelectLimit }),
          }),
        }),
      }),
    )
  })

  it('アクティブな支援者に単発決済のCheckoutを作成する', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([{ id: 'sub-1' }])

    const { POST } = await import('./route')
    const res = await POST(
      new Request('https://cairn.example/api/billing/credit-packs/checkout', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    expect(mockStripeSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer: 'cus-existing',
        line_items: [{ price: 'price_credit_pack', quantity: 1 }],
        metadata: expect.objectContaining({
          purchaseType: 'credit_pack',
          creditPackCredits: '400',
          creditPackPriceId: 'price_credit_pack',
          creditPackAmountJpy: '500',
        }),
      }),
    )
  })

  it('アクティブな支援者でなければクレジットパックを購入できない', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([])

    const { POST } = await import('./route')
    const res = await POST(
      new Request('https://cairn.example/api/billing/credit-packs/checkout', { method: 'POST' }),
    )

    expect(res.status).toBe(403)
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('設定済みPriceの通貨または金額が異なる場合はCheckoutを作成しない', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([{ id: 'sub-1' }])
    mockStripePriceRetrieve.mockResolvedValue({
      active: true,
      currency: 'usd',
      type: 'one_time',
      unit_amount: 500,
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request('https://cairn.example/api/billing/credit-packs/checkout', { method: 'POST' }),
    )

    expect(res.status).toBe(500)
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('決済内容を検証できない旧Checkoutを失効して新規作成する', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([{ id: 'sub-1' }])
    mockStripeSessionsList.mockResolvedValue({
      data: [
        {
          id: 'cs-legacy',
          url: 'https://checkout.stripe.test/legacy',
          metadata: {
            workspaceId: 'workspace-1',
            supporterUserId: 'user-1',
            purchaseType: 'credit_pack',
          },
        },
      ],
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request('https://cairn.example/api/billing/credit-packs/checkout', { method: 'POST' }),
    )

    expect(res.status).toBe(200)
    expect(mockStripeSessionsExpire).toHaveBeenCalledWith('cs-legacy')
    expect(mockStripeSessionsCreate).toHaveBeenCalledOnce()
  })
})
