// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const TARGET_ID = '00000000-0000-0000-0000-000000000002'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const ATTRIBUTE_ID = '20000000-0000-0000-0000-000000000001'

const { getAuthContext, tx, db } = vi.hoisted(() => {
  const tx = {
    select: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
  return {
    getAuthContext: vi.fn(),
    tx,
    db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) },
  }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireRole: (role: string) => role === 'owner' || role === 'admin'
    ? null
    : new Response(JSON.stringify({ error: 'この操作には管理者以上の権限が必要です' }), { status: 403 }),
}))
vi.mock('@cairn/db', () => ({
  db,
  workspaceMembers: {
    id: 'member.id',
    workspaceId: 'member.workspaceId',
    userId: 'member.userId',
    membershipStatus: 'member.membershipStatus',
    profileAttributes: 'member.profileAttributes',
  },
  workspaceProfileAttributes: {
    id: 'attribute.id',
    workspaceId: 'attribute.workspaceId',
    name: 'attribute.name',
    color: 'attribute.color',
  },
  workspaceMemberProfileAttributes: {
    workspaceMemberId: 'assignment.workspaceMemberId',
    profileAttributeId: 'assignment.profileAttributeId',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
}))

function request(attributeIds: string[]) {
  return new Request(`http://localhost/api/workspaces/members/${TARGET_ID}/profile-attributes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributeIds }),
  })
}

function selectChain(rows: unknown[]) {
  const promise = Promise.resolve(rows)
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: promise.then.bind(promise),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

function writeChain() {
  const promise = Promise.resolve([])
  const chain = { where: vi.fn(), values: vi.fn(), set: vi.fn(), then: promise.then.bind(promise) }
  chain.where.mockReturnValue(chain)
  chain.values.mockReturnValue(chain)
  chain.set.mockReturnValue(chain)
  return chain
}

describe('PATCH /api/workspaces/members/[userId]/profile-attributes', () => {
  afterEach(() => vi.clearAllMocks())

  it('member は属性を変更できない', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    const { PATCH } = await import('./route')
    const res = await PATCH(request([ATTRIBUTE_ID]), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(403)
  })

  it('重複する属性IDを拒否する', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'admin' },
      error: null,
    })
    const { PATCH } = await import('./route')
    const res = await PATCH(request([ATTRIBUTE_ID, ATTRIBUTE_ID]), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(422)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('admin は同じワークスペースの属性をactiveメンバーへ設定できる', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'admin' },
      error: null,
    })
    tx.select
      .mockReturnValueOnce(selectChain([{ id: 'member-1', membershipStatus: 'active' }]))
      .mockReturnValueOnce(selectChain([{ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' }]))
    tx.delete.mockReturnValueOnce(writeChain())
    tx.insert.mockReturnValueOnce(writeChain())
    tx.update.mockReturnValueOnce(writeChain())

    const { PATCH } = await import('./route')
    const res = await PATCH(request([ATTRIBUTE_ID]), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      userId: TARGET_ID,
      profileAttributes: [{ id: ATTRIBUTE_ID, name: '3年生', color: 'blue' }],
    })
    expect(tx.insert).toHaveBeenCalled()
    expect(tx.update).toHaveBeenCalled()
  })
})
