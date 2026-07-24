// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockGetWorkspaceRole,
  mockStripeCustomersCreate,
  mockStripeSessionsCreate,
  mockSelectLimit,
  mockInsertReturning,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetWorkspaceRole: vi.fn(),
  mockStripeCustomersCreate: vi.fn(),
  mockStripeSessionsCreate: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/access/membership', () => ({ getWorkspaceRole: mockGetWorkspaceRole }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: () => true }))
vi.mock('@/lib/billing/stripe', () => ({
  getIndividualSubscriptionPriceId: () => 'price_individual',
  getStripeClient: () => ({
    customers: { create: mockStripeCustomersCreate },
    checkout: { sessions: { create: mockStripeSessionsCreate } },
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
  },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelectLimit }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: mockInsertReturning }),
      }),
    }),
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
}))

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    mockGetWorkspaceRole.mockResolvedValue('member')
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus-created' })
    mockStripeSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' })
  })

  it('顧客作成の競合時は永続化済みCustomerでCheckoutを作成する', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-persisted' }])
    mockInsertReturning.mockResolvedValue([])

    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    }))

    expect(res.status).toBe(200)
    expect(mockStripeSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus-persisted',
    }))
  })
})
