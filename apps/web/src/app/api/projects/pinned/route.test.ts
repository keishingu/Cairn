// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth, visible, access, db, inArray } = vi.hoisted(() => ({
  auth: vi.fn(), visible: vi.fn(), access: vi.fn(),
  db: { select: vi.fn(), insert: vi.fn() }, inArray: vi.fn(),
}))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: auth }))
vi.mock('@/lib/permissions', () => ({ getGuestVisibleProjectIds: visible, requireProjectAccess: access }))
vi.mock('@cairn/db', () => ({
  db, pinnedProjects: { id: 'pin.id', projectId: 'pin.projectId', userId: 'pin.userId', workspaceId: 'pin.workspaceId', sortOrder: 'pin.sortOrder', pinnedAt: 'pin.pinnedAt' },
  projects: { id: 'project.id', workspaceId: 'project.workspaceId', title: 'project.title', statusId: 'project.statusId' },
  projectStatuses: { id: 'status.id', name: 'status.name', color: 'status.color' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn((...x) => x), and: vi.fn((...x) => x), asc: vi.fn(), inArray }))

import { GET, POST } from './route'

describe('プロジェクトのピンのアクセス制御', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ ctx: { userId: 'user', workspaceId: 'workspace', role: 'guest' }, error: null })
  })

  it('未参加プロジェクトへのピンを拒否する', async () => {
    access.mockResolvedValue(new Response(null, { status: 403 }))
    const response = await POST(new Request('http://localhost/api/projects/pinned', {
      method: 'POST', body: JSON.stringify({ projectId: 'other' }),
    }))
    expect(response.status).toBe(403)
    expect(access).toHaveBeenCalledWith('workspace', 'user', 'other', 'guest')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('参加解除後に残ったピンを返さない', async () => {
    visible.mockResolvedValue([])
    const response = await GET()
    expect(await response.json()).toEqual([])
    expect(db.select).not.toHaveBeenCalled()
  })

  it('参加中のプロジェクトだけを一覧クエリに含める', async () => {
    visible.mockResolvedValue(['allowed'])
    const scope = { scope: true }
    inArray.mockReturnValue(scope)
    const chain = { from: vi.fn(), innerJoin: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn() }
    for (const fn of [chain.from, chain.innerJoin, chain.leftJoin, chain.where]) fn.mockReturnValue(chain)
    chain.orderBy.mockResolvedValue([])
    db.select.mockReturnValue(chain)
    expect((await GET()).status).toBe(200)
    expect(inArray).toHaveBeenCalledWith('project.id', ['allowed'])
    expect(chain.where).toHaveBeenCalledWith(expect.arrayContaining([scope]))
  })
})
