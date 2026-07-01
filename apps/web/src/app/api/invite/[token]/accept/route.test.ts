// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

// --- vi.hoisted ---
const { mockGetAuthUser, mockDb } = vi.hoisted(() => {
  const mockGetAuthUser = vi.fn().mockResolvedValue({
    userId: '00000000-0000-0000-0000-000000000001',
    error: null,
  })
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  return { mockGetAuthUser, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthUser: mockGetAuthUser,
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceInvites: {
    id: 'wi.id',
    workspaceId: 'wi.workspaceId',
    token: 'wi.token',
    expiresAt: 'wi.expiresAt',
    maxUses: 'wi.maxUses',
    useCount: 'wi.useCount',
    role: 'wi.role',
    projectId: 'wi.projectId',
  },
  workspaceMembers: {
    id: 'wm.id',
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  },
  projectMembers: {
    id: 'pm.id',
    projectId: 'pm.projectId',
    userId: 'pm.userId',
    role: 'pm.role',
    attendance: 'pm.attendance',
  },
  projects: {
    id: 'p.id',
    workspaceId: 'p.workspaceId',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  or: vi.fn(() => 'or'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn(() => 'sql'),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}))

const VALID_TOKEN = 'valid-token-abc123'
const WORKSPACE_ID = 'ws-00000001'

/** 単一結果を返す select チェーン */
function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

/** limit を使わず where で終わる select チェーン */
function selectWhereChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }
}

/** アトミック update チェーン */
function updateChain(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('POST /api/invite/[token]/accept', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ userId: DEV_USER_ID, error: null })
  })

  it('未認証なら認証エラーを返す', async () => {
    mockGetAuthUser.mockResolvedValue({
      userId: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const { POST } = await import('./route')

    const res = await POST(
      new Request('http://localhost/api/invite/any-token/accept', { method: 'POST' }),
      { params: Promise.resolve({ token: 'any-token' }) },
    )

    expect(res.status).toBe(401)
  })

  it('存在しない・期限切れトークンには 404 を返す', async () => {
    // 招待なし
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/invite/bad-token/accept', { method: 'POST' }),
      { params: Promise.resolve({ token: 'bad-token' }) },
    )

    expect(res.status).toBe(404)
  })

  it('既にメンバーの場合はべき等に 200 を返す（use_count を増やさない）', async () => {
    const invite = { id: 'inv-01', workspaceId: WORKSPACE_ID, role: 'member', expiresAt: null, maxUses: null, useCount: 0 }

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))                                // 招待取得
      .mockReturnValueOnce(selectChain([{ id: 'existing-membership-id', membershipStatus: 'active' }]))     // 既存メンバー

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; workspaceId: string }
    expect(body.ok).toBe(true)
    expect(body.workspaceId).toBe(WORKSPACE_ID)
    // update は呼ばれないこと（use_count が増えない）
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('inactive メンバーが再招待を受けたら membership を active に戻し、invite role を反映する', async () => {
    const invite = { id: 'inv-01b', workspaceId: WORKSPACE_ID, role: 'member', expiresAt: null, maxUses: null, useCount: 0 }
    const reactivateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    })

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))
      .mockReturnValueOnce(selectChain([{ id: 'existing-inactive-membership-id', membershipStatus: 'inactive' }]))

    mockDb.update
      .mockReturnValueOnce(
        updateChain([{ id: 'inv-01b', workspaceId: WORKSPACE_ID, role: 'member' }])
      )
      .mockReturnValueOnce({
        set: reactivateSet,
      })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; workspaceId: string }
    expect(body.ok).toBe(true)
    expect(body.workspaceId).toBe(WORKSPACE_ID)
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    expect(reactivateSet).toHaveBeenCalledWith({ membershipStatus: 'active', role: 'member' })
  })

  it('inactive メンバーが guest として再招待されたら旧 project membership を掃除して招待対象だけ付け直す', async () => {
    const invite = {
      id: 'inv-01c',
      workspaceId: WORKSPACE_ID,
      role: 'guest',
      projectId: 'project-invited',
      expiresAt: null,
      maxUses: null,
      useCount: 0,
    }
    const reactivateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    })
    const deleteWhere = vi.fn().mockResolvedValue([])
    const projectMemberInsert = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    })

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))
      .mockReturnValueOnce(selectChain([{ id: 'existing-inactive-membership-id', membershipStatus: 'inactive' }]))
      .mockReturnValueOnce(selectWhereChain([{ id: 'project-old-1' }, { id: 'project-invited' }]))

    mockDb.update
      .mockReturnValueOnce(
        updateChain([{ id: 'inv-01c', workspaceId: WORKSPACE_ID, role: 'guest', projectId: 'project-invited' }])
      )
      .mockReturnValueOnce({
        set: reactivateSet,
      })

    mockDb.delete.mockReturnValueOnce({
      where: deleteWhere,
    })

    mockDb.insert.mockReturnValueOnce({
      values: projectMemberInsert,
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    expect(reactivateSet).toHaveBeenCalledWith({ membershipStatus: 'active', role: 'guest' })
    expect(mockDb.delete).toHaveBeenCalledTimes(1)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(projectMemberInsert).toHaveBeenCalledWith({
      projectId: 'project-invited',
      userId: DEV_USER_ID,
      role: 'member',
      attendance: 'attending',
    })
  })

  it('max_uses に達していると 410 を返す', async () => {
    const invite = { id: 'inv-02', workspaceId: WORKSPACE_ID, role: 'member', expiresAt: null, maxUses: 5, useCount: 5 }

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))  // 招待取得
      .mockReturnValueOnce(selectChain([]))         // 既存メンバーなし

    // アトミック update: use_count < max_uses を満たさないので行が返らない
    mockDb.update.mockReturnValueOnce(updateChain([]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(410)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('usage limit')
  })

  it('有効なトークン・未参加ユーザー → ワークスペースに追加して workspaceId を返す', async () => {
    const invite = { id: 'inv-03', workspaceId: WORKSPACE_ID, role: 'member', expiresAt: null, maxUses: null, useCount: 0 }

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))  // 招待取得
      .mockReturnValueOnce(selectChain([]))         // 既存メンバーなし

    // アトミック update: 成功 → 行を返す
    mockDb.update.mockReturnValueOnce(
      updateChain([{ id: 'inv-03', workspaceId: WORKSPACE_ID, role: 'member' }])
    )

    // workspaceMembers insert
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue([]),
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; workspaceId: string }
    expect(body.ok).toBe(true)
    expect(body.workspaceId).toBe(WORKSPACE_ID)
    // use_count がアトミックに更新されたこと
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    // メンバーが追加されたこと
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it('max_uses が null（無制限）の場合は何度でも参加可能', async () => {
    const invite = { id: 'inv-04', workspaceId: WORKSPACE_ID, role: 'guest', expiresAt: null, maxUses: null, useCount: 99 }

    mockDb.select
      .mockReturnValueOnce(selectChain([invite]))
      .mockReturnValueOnce(selectChain([]))  // 未参加

    mockDb.update.mockReturnValueOnce(
      updateChain([{ id: 'inv-04', workspaceId: WORKSPACE_ID, role: 'guest' }])
    )

    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/invite/${VALID_TOKEN}/accept`, { method: 'POST' }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )

    expect(res.status).toBe(200)
  })
})
