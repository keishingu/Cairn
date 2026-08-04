// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAuthContext,
  mockGetWorkspaceRole,
  mockIsWorkspaceOwner,
  mockStripeCustomersCreate,
  mockStripeSessionsList,
  mockStripeSubscriptionsList,
  mockStripeSessionsCreate,
  mockSelectLimit,
  mockInsertReturning,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetWorkspaceRole: vi.fn(),
  mockIsWorkspaceOwner: vi.fn((role: string) => role === 'owner'),
  mockStripeCustomersCreate: vi.fn(),
  mockStripeSessionsList: vi.fn(),
  mockStripeSubscriptionsList: vi.fn(),
  mockStripeSessionsCreate: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/access/membership', () => ({
  getWorkspaceRole: mockGetWorkspaceRole,
  isWorkspaceOwner: mockIsWorkspaceOwner,
}))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: () => true }))
vi.mock('@/lib/billing/stripe', () => ({
  getIndividualSubscriptionPriceId: () => 'price_individual',
  getStripeClient: () => ({
    customers: { create: mockStripeCustomersCreate },
    checkout: { sessions: { create: mockStripeSessionsCreate, list: mockStripeSessionsList } },
    subscriptions: { list: mockStripeSubscriptionsList },
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
    transaction: mockTransaction,
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

function stripeList<T>(data: T[]) {
  return {
    data,
    async *[Symbol.asyncIterator]() {
      yield* data
    },
  }
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    mockGetWorkspaceRole.mockResolvedValue('member')
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus-created' })
    mockStripeSessionsList.mockReturnValue(stripeList([]))
    mockStripeSubscriptionsList.mockReturnValue(stripeList([]))
    mockStripeSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' })
    mockTransaction.mockImplementation(async (callback) => callback({
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: () => ({ limit: mockSelectLimit }),
        }),
      }),
    }))
  })

  it('顧客作成の競合時は永続化済みCustomerでCheckoutを作成する', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-persisted' }])
      .mockResolvedValueOnce([])
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

  it('未対応のプラン値はSoloへフォールバックせず拒否する', async () => {
    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'workspcae' }),
    }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'プランはindividualまたはworkspaceで指定してください' })
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('Stripe上の同一ワークスペースの未完了Checkoutを再利用する', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([])
    mockStripeSessionsList.mockReturnValue(stripeList([
      {
        url: 'https://checkout.stripe.test/open-session',
        metadata: { workspaceId: 'workspace-1', supporterUserId: 'user-1', plan: 'individual' },
      },
    ]))

    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/open-session' })
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('Webhook同期前にStripe購読が存在する場合はCheckoutを新規作成しない', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-existing' }])
      .mockResolvedValueOnce([])
    mockStripeSubscriptionsList.mockReturnValue(stripeList([
      {
        status: 'active',
        metadata: { workspaceId: 'workspace-1', supporterUserId: 'user-1', plan: 'individual' },
      },
    ]))

    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    }))

    expect(res.status).toBe(409)
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('別ownerの未完了Team Checkoutは再利用せず競合として扱う', async () => {
    mockGetWorkspaceRole.mockResolvedValue('owner')
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-owner-b' }])
      .mockResolvedValueOnce([])
    mockStripeSessionsList.mockReturnValue(stripeList([
      {
        url: 'https://checkout.stripe.test/owner-a-session',
        metadata: { workspaceId: 'workspace-1', supporterUserId: 'user-a', plan: 'workspace' },
      },
    ]))

    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'workspace' }),
    }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: '別のオーナーがTeamプランの決済を進めています。完了後に請求管理画面を確認してください',
    })
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })

  it('ページをまたぐ未完了Team Checkoutを検出する', async () => {
    mockGetWorkspaceRole.mockResolvedValue('owner')
    mockSelectLimit
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus-owner' }])
      .mockResolvedValueOnce([])
    mockStripeSessionsList.mockReturnValue(stripeList([
      ...Array.from({ length: 100 }, () => ({ metadata: {} })),
      {
        url: 'https://checkout.stripe.test/own-session',
        metadata: { workspaceId: 'workspace-1', supporterUserId: 'user-1', plan: 'workspace' },
      },
    ]))

    const { POST } = await import('./route')
    const res = await POST(new Request('https://cairn.example/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'workspace' }),
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/own-session' })
    expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
  })
})
