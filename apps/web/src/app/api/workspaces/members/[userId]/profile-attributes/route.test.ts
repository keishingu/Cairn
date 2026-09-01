// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const TARGET_ID = '00000000-0000-0000-0000-000000000002'
const WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'

const { getAuthContext, db } = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  db: { select: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext }))
vi.mock('@/lib/permissions', () => ({
  isWorkspaceAdmin: (role: string) => role === 'owner' || role === 'admin',
}))
vi.mock('@cairn/db', () => ({
  db,
  workspaceMembers: {
    workspaceId: 'workspaceId',
    userId: 'userId',
    membershipStatus: 'membershipStatus',
    profileAttributes: 'profileAttributes',
  },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => 'and'), eq: vi.fn(() => 'eq') }))

function request(attributes: string[]) {
  return new Request(`http://localhost/api/workspaces/members/${TARGET_ID}/profile-attributes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes }),
  })
}

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
    }),
  }
}

function updateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
    }),
  }
}

describe('PATCH /api/workspaces/members/[userId]/profile-attributes', () => {
  afterEach(() => vi.clearAllMocks())

  it('member は属性を変更できない', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'member' },
      error: null,
    })
    const { PATCH } = await import('./route')
    const res = await PATCH(request(['3年生']), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(403)
  })

  it('trim 後に重複する属性を拒否する', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'admin' },
      error: null,
    })
    const { PATCH } = await import('./route')
    const res = await PATCH(request(['3年生', ' 3年生 ']), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(422)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('admin は active メンバーの属性を設定できる', async () => {
    getAuthContext.mockResolvedValue({
      ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID, role: 'admin' },
      error: null,
    })
    db.select.mockReturnValueOnce(selectChain([{ membershipStatus: 'active' }]))
    db.update.mockReturnValueOnce(updateChain([{ userId: TARGET_ID, profileAttributes: ['3年生', '経済学部'] }]))
    const { PATCH } = await import('./route')
    const res = await PATCH(request([' 3年生 ', '経済学部']), { params: Promise.resolve({ userId: TARGET_ID }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ userId: TARGET_ID, profileAttributes: ['3年生', '経済学部'] })
  })
})
