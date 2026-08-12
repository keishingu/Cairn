// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

// --- vi.hoisted ---
const { mockGetAuthContext, mockDb, mockRunForActiveMembership } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '10000000-0000-0000-0000-000000000001',
      role: 'admin',
    },
    error: null,
  })
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  }
  return { mockGetAuthContext, mockDb, mockRunForActiveMembership: vi.fn() }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))
vi.mock('@/lib/access/active-membership-lock', () => ({
  runForActiveMembership: mockRunForActiveMembership,
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
    mockRunForActiveMembership.mockImplementation((_db, _workspaceId, _userId, action) =>
      action(mockDb),
    )
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'admin' }, error: null,
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
    // 権限判定は ctx.role で行う（DB 往復なし）。member は admin 未満 → 403
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' }, error: null,
    })

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
    // guest は admin 未満 → 403（非所属は getAuthContext 側で 403 になる）
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'guest' }, error: null,
    })

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
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'owner' }, error: null,
    })

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
    // 既定 ctx.role = 'admin'
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

  it('退会済みなら招待トークンを作成しない', async () => {
    mockRunForActiveMembership.mockResolvedValue(null)

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/workspaces/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: '1h' }),
      }),
    )

    expect(res.status).toBe(403)
    expect(mockDb.insert).not.toHaveBeenCalled()
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
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'admin' },
      error: null,
    })
  })

  it('admin は招待一覧を取得できる', async () => {
    // 既定 ctx.role = 'admin'。招待一覧は空
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const { GET } = await import('./route')

    const res = await GET(
      new Request('http://localhost/api/workspaces/invites'),
    )

    expect(res.status).toBe(200)
  })

  it('member は招待一覧を取得できない', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID, role: 'member' }, error: null,
    })
    const { GET } = await import('./route')

    const res = await GET(
      new Request('http://localhost/api/workspaces/invites'),
    )

    expect(res.status).toBe(403)
  })
})
