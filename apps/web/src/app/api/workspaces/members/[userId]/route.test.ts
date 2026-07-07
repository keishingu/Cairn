// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '10000000-0000-0000-0000-000000000001',
    },
    error: null,
  })
  const mockDb = { select: vi.fn(), update: vi.fn() }
  const mockGetWorkspaceMemberRole = vi.fn().mockResolvedValue('admin')
  return { mockGetAuthContext, mockDb, mockGetWorkspaceMemberRole }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  getWorkspaceMemberRole: mockGetWorkspaceMemberRole,
  isWorkspaceAdmin: (role: string | null) => role === 'owner' || role === 'admin',
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
  profiles: { id: 'profiles.id', kind: 'profiles.kind' },
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
  const chain = {
    where: vi.fn().mockReturnValue(whereReturn),
  }
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
      innerJoin: vi.fn().mockReturnValue(chain),
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
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockGetWorkspaceMemberRole.mockResolvedValue('admin')
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
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', kind: 'human' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json() as { role: string }
    expect(body.role).toBe('admin')
  })

  it('admin は admin を member に降格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin', kind: 'human' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'member'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('admin は owner への昇格を行えない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', kind: 'human' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'owner'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('admin は owner のロールを変更できない（403）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', kind: 'human' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(403)
  })

  it('owner は member を owner に昇格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', kind: 'human' }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'owner'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('owner が複数いる場合、owner を降格できる', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', kind: 'human' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 2 }]))
    mockDb.update.mockReturnValueOnce(updateChain())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(200)
  })

  it('唯一の owner は降格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner', kind: 'human' }]))
    mockDb.select.mockReturnValueOnce(selectChain([{ ownerCount: 1 }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('owner')
  })

  it('ゲストを通常ロールへ昇格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('admin')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'guest', kind: 'human' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'member'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('ゲスト')
  })

  it('通常ロールをゲストへ降格できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', kind: 'human' }]))
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

  it('bot メンバーのロールは変更できない（422）', async () => {
    mockGetWorkspaceMemberRole.mockResolvedValueOnce('owner')
    mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', kind: 'bot' }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest(OTHER_USER_ID, 'admin'), { params: Promise.resolve({ userId: OTHER_USER_ID }) })
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({ error: 'Bot member role cannot be changed' })
  })
})
