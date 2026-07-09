// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole, mockDeactivate, mockReactivate, mockInngestSend } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '10000000-0000-0000-0000-000000000001',
    },
    error: null,
  })
  const mockDb = { select: vi.fn(), update: vi.fn(), execute: vi.fn(), transaction: vi.fn() }
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('admin')
  const mockDeactivate = vi.fn().mockResolvedValue({ ok: true })
  const mockReactivate = vi.fn().mockResolvedValue({ ok: true })
  const mockInngestSend = vi.fn().mockResolvedValue(undefined)
  return { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole, mockDeactivate, mockReactivate, mockInngestSend }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  isWorkspaceAdmin: (role: string | null) => role === 'owner' || role === 'admin',
}))

vi.mock('@/lib/access/lifecycle', () => ({
  deactivateMembership: mockDeactivate,
  reactivateMembership: mockReactivate,
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: mockInngestSend },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
  activeWorkspaceMembers: { workspaceId: 'awm.workspaceId', role: 'awm.role' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  count: vi.fn(() => 'count'),
  sql: vi.fn(() => 'sql'),
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
  return new Request(`http://localhost/api/workspaces/members/${targetUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

describe('PATCH /api/workspaces/members/[userId]', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb))
    mockDb.execute.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockInngestSend.mockResolvedValue(undefined)
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
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalledWith('sql')
  })

  it('唯一の owner は降格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
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
})

function statusRequest(targetUserId: string, status: string) {
  return new Request(`http://localhost/api/workspaces/members/${targetUserId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

describe('PATCH /api/workspaces/members/[userId]（非活性化 / 再活性化）', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb))
    mockDb.execute.mockResolvedValue(undefined)
  })
  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
    mockDeactivate.mockResolvedValue({ ok: true })
    mockReactivate.mockResolvedValue({ ok: true })
    mockInngestSend.mockResolvedValue(undefined)
  })

  it('admin は通常メンバーを非活性化できる（lifecycle に委譲）', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'inactive'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    expect(mockDeactivate).toHaveBeenCalledWith(DEV_WORKSPACE_ID, OTHER_USER_ID, DEV_USER_ID)
  })

  it('member は非活性化できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('member')
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'inactive'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
    expect(mockDeactivate).not.toHaveBeenCalled()
  })

  it('自分自身は非活性化できない（422）', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(DEV_USER_ID, 'inactive'), { params: Promise.resolve({ userId: DEV_USER_ID }) })
    expect(res.status).toBe(422)
    expect(mockDeactivate).not.toHaveBeenCalled()
  })

  it('admin は owner の活性状態を変更できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'inactive'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
    expect(mockDeactivate).not.toHaveBeenCalled()
  })

  it('owner は owner を非活性化できる（lifecycle が最後の owner を守る）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'inactive'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    expect(mockDeactivate).toHaveBeenCalled()
  })

  it('lifecycle が最後の active owner を弾いたら 422 を返す', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
    mockDeactivate.mockResolvedValueOnce({ ok: false, status: 422, error: 'ワークスペースには最低1人の active な owner が必要です' })
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'inactive'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
  })

  it('admin は再活性化できる', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'active'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    expect(mockReactivate).toHaveBeenCalledWith(DEV_WORKSPACE_ID, OTHER_USER_ID)
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'member/upserted',
      data: { userId: OTHER_USER_ID, workspaceId: DEV_WORKSPACE_ID },
    })
  })

  it('無効な status 値は 422', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(statusRequest(OTHER_USER_ID, 'archived'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
  })
})
