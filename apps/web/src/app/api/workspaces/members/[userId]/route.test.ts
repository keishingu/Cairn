// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole, mockClearWorkspaceAccessCache } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '10000000-0000-0000-0000-000000000001',
    },
    error: null,
  })
  const mockDb = { select: vi.fn(), update: vi.fn() }
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('admin')
  const mockClearWorkspaceAccessCache = vi.fn()
  return { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole, mockClearWorkspaceAccessCache }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
  clearWorkspaceAccessCache: mockClearWorkspaceAccessCache,
}))

vi.mock('@/lib/permissions', () => ({
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  isWorkspaceAdmin: (role: string | null) => role === 'owner' || role === 'admin',
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
}))

function selectChain(result: unknown[]) {
  // .where() は直接 await できつつ、.limit() も持つ thenable を返す
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
    }),
    where: vi.fn().mockResolvedValue(result),
  }
}

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }
}

function patchRequest(targetUserId: string, role: string) {
  return patchRequestWithBody(targetUserId, { role })
}

function patchRequestWithBody(targetUserId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/workspaces/members/${targetUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/workspaces/members/[userId]', () => {
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
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockClearWorkspaceAccessCache.mockReset()
  })

  it('未認証なら 401 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(401)
  })

  it('無効なロール値は 422 を返す', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'superadmin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
  })

  it('role と status の両方が無いと 422 を返す', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, {}), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
  })

  it('無効な status 値は 422 を返す', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, { status: 'paused' }), {
      params: Promise.resolve({ userId: OTHER_USER_ID }),
    })
    expect(res.status).toBe(422)
  })

  it('member は変更できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('member')
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('admin は member を admin に昇格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json() as { role: string }
    expect(body.role).toBe('admin')
  })

  it('admin は admin を member に降格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'member'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('admin は owner への昇格を行えない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'owner'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('admin は owner のロールを変更できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('owner は member を owner に昇格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'owner'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('owner が複数いる場合、owner を降格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('唯一の owner は降格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 1 }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('owner')
  })

  it('ゲストを通常ロールへ昇格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'guest' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'member'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('ゲスト')
  })

  it('通常ロールをゲストへ降格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'guest'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
  })

  it('存在しないメンバーは 404 を返す', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'member'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(404)
  })

  it('admin は member を inactive にできる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
    const update = updateChain()
    mockDb.update.mockReturnValueOnce(update)
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, { status: 'inactive' }), {
      params: Promise.resolve({ userId: OTHER_USER_ID }),
    })

    expect(res.status).toBe(200)
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({
      membershipStatus: 'inactive',
      deactivatedBy: DEV_USER_ID,
      deactivatedAt: expect.any(Date),
    }))
    expect(mockClearWorkspaceAccessCache).toHaveBeenCalledWith(OTHER_USER_ID)
    await expect(res.json()).resolves.toMatchObject({
      userId: OTHER_USER_ID,
      role: 'member',
      status: 'inactive',
    })
  })

  it('admin は inactive な member を active に戻せる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'inactive' }]))
    const update = updateChain()
    mockDb.update.mockReturnValueOnce(update)
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, { status: 'active' }), {
      params: Promise.resolve({ userId: OTHER_USER_ID }),
    })

    expect(res.status).toBe(200)
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({
      membershipStatus: 'active',
      deactivatedAt: null,
      deactivatedBy: null,
    }))
    expect(mockClearWorkspaceAccessCache).toHaveBeenCalledWith(OTHER_USER_ID)
    await expect(res.json()).resolves.toMatchObject({
      userId: OTHER_USER_ID,
      role: 'member',
      status: 'active',
    })
  })

  it('ロール変更だけならワークスペースキャッシュは破棄しない', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(mockClearWorkspaceAccessCache).not.toHaveBeenCalled()
  })

  it('唯一の active owner は非活性化できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 1 }]))
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, { status: 'inactive' }), {
      params: Promise.resolve({ userId: OTHER_USER_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('active')
  })

  it('他に active owner がいれば owner を非活性化できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
    const update = updateChain()
    mockDb.update.mockReturnValueOnce(update)
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequestWithBody(OTHER_USER_ID, { status: 'inactive' }), {
      params: Promise.resolve({ userId: OTHER_USER_ID }),
    })

    expect(res.status).toBe(200)
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({
      membershipStatus: 'inactive',
      deactivatedBy: DEV_USER_ID,
    }))
  })

  it('inactive owner は active owner 数に影響せず降格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'inactive' }]))
    const update = updateChain()
    mockDb.update.mockReturnValueOnce(update)
    const { PATCH } = await import('./route')

    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })

    expect(res.status).toBe(200)
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }))
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
