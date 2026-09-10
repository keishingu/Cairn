// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const ATTRIBUTE_ID = '20000000-0000-0000-0000-000000000001'

const { getAuthContext, db } = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  db: { select: vi.fn(), insert: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: (role: string) => role === 'owner' || role === 'admin'
    ? null
    : new Response(JSON.stringify({ error: 'この操作には管理者以上の権限が必要です' }), { status: 403 }),
}))
vi.mock('@cairn/db', () => ({
  db,
  workspaceProfileAttributes: {
    id: 'attribute.id',
    workspaceId: 'attribute.workspaceId',
    name: 'attribute.name',
    color: 'attribute.color',
    createdAt: 'attribute.createdAt',
  },
}))
vi.mock('drizzle-orm', () => ({ asc: vi.fn(() => 'asc'), eq: vi.fn(() => 'eq') }))

function queryChain(rows: unknown[]) {
  const promise = Promise.resolve(rows)
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    then: promise.then.bind(promise),
  }
  for (const method of ['from', 'where', 'orderBy', 'values', 'returning'] as const) {
    chain[method].mockReturnValue(chain)
  }
  return chain
}

describe('/api/workspaces/profile-attributes', () => {
  afterEach(() => vi.clearAllMocks())

  it('所属ワークスペースの属性一覧を返す', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    db.select.mockReturnValueOnce(queryChain([{ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' }]))
    const { GET } = await import('./route')
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([{ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' }])
  })

  it('member は属性を作成できない', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: '3年生', color: 'blue' }),
    }))
    expect(response.status).toBe(403)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('admin は名称と色を指定して属性を作成できる', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { workspaceId: WORKSPACE_ID, role: 'admin' },
      error: null,
    })
    db.insert.mockReturnValueOnce(queryChain([{ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' }]))
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: ' 3年生 ', color: 'blue' }),
    }))
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' })
  })
})
