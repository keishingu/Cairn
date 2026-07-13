// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { resetRequestRateLimitForTest } from '@/lib/request-rate-limit'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

// --- vi.hoisted ---
const { mockGetAuthContext, mockDb, limitMock, slidingWindowMock, redisCtorMock } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '10000000-0000-0000-0000-000000000001',
    },
    error: null,
  })
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  }
  const limitMock = vi.fn()
  const slidingWindowMock = vi.fn()
  const redisCtorMock = vi.fn()
  return { mockGetAuthContext, mockDb, limitMock, slidingWindowMock, redisCtorMock }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceInvites: {
    id: 'wi.id',
    workspaceId: 'wi.workspaceId',
    token: 'wi.token',
    createdBy: 'wi.createdBy',
    expiresAt: 'wi.expiresAt',
    maxUses: 'wi.maxUses',
    useCount: 'wi.useCount',
    role: 'wi.role',
    createdAt: 'wi.createdAt',
  },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
  activeWorkspaceMembers: { workspaceId: 'awm.workspaceId', userId: 'awm.userId', role: 'awm.role' },
  profiles: { id: 'profiles.id', displayName: 'profiles.displayName' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  or: vi.fn(() => 'or'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindowMock

    constructor() {}

    limit = limitMock
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) {
      redisCtorMock(config)
    }
  },
}))

/** 単一結果を返す select チェーン */
function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        orderBy: vi.fn().mockResolvedValue(result),
      }),
      innerJoin: vi.fn().mockReturnThis(),
    }),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(result),
      orderBy: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('POST /api/workspaces/invites', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    delete process.env['UPSTASH_REDIS_REST_URL']
    delete process.env['UPSTASH_REDIS_REST_TOKEN']
    vi.clearAllMocks()
    resetRequestRateLimitForTest()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID }, error: null,
    })
  })

  it('未認証なら認証エラーを返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const { POST } = await import('./route')

    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(401)
  })

  it('owner でないユーザーには 403 を返す', async () => {
    // requireWorkspaceAdmin の DB クエリ: role が 'member' → false
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: '1h' }),
      }),
    )

    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('この操作には管理者以上の権限が必要です')
  })

  it('メンバーシップなし（ゲストも含む）は 403', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))  // no membership found

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: '30d' }),
      }),
    )

    expect(res.status).toBe(403)
  })

  it('owner は招待トークンを作成できる', async () => {
    // requireWorkspaceAdmin: owner
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))

    const fakeToken = 'aaaabbbb-cccc-dddd-eeee-ffffgggghhh'
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          token: fakeToken,
          expiresAt: null,
          role: 'member',
        }]),
      }),
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 'never', role: 'member' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { token: string; url: string; role: string }
    expect(body.token).toBe(fakeToken)
    expect(body.url).toContain(`/invite/${fakeToken}`)
    expect(body.role).toBe('member')
  })

  it('admin も招待トークンを作成できる', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))

    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          token: 'admin-token-123',
          expiresAt: new Date('2026-07-01'),
          role: 'guest',
        }]),
      }),
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: '30d', role: 'guest' }),
      }),
    )

    expect(res.status).toBe(200)
  })

  it('短時間の招待リンク連続発行は 429 で制限する', async () => {
    mockDb.select.mockReturnValue(selectChain([{ role: 'owner' }]))
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          token: 'rate-limit-token',
          expiresAt: null,
          role: 'member',
        }]),
      }),
    })

    const { POST } = await import('./route')
    for (let i = 0; i < 10; i += 1) {
      limitMock.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 9 - i,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      })
    }
    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    for (let i = 0; i < 10; i += 1) {
      const res = await POST(
        new Request('http://localhost/api/workspaces/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: 'never', role: 'member' }),
        }),
      )
      expect(res.status).toBe(200)
    }

    const limited = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 'never', role: 'member' }),
      }),
    )

    expect(limited.status).toBe(429)
    expect(mockDb.insert).toHaveBeenCalledTimes(10)
  })
})

describe('GET /api/workspaces/invites', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  it('admin は招待一覧を取得できる', async () => {
    // requireWorkspaceAdmin: admin ロールを持つ
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))
    // 招待一覧は空
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const { GET } = await import('./route')

    const res = await GET(
      new Request('http://localhost/api/workspaces/invites'),
    )

    expect(res.status).toBe(200)
  })

  it('member は招待一覧を取得できない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    const { GET } = await import('./route')

    const res = await GET(
      new Request('http://localhost/api/workspaces/invites'),
    )

    expect(res.status).toBe(403)
  })
})
