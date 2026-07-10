// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockDb, activeWorkspaceMembers, mockHeaders } = vi.hoisted(() => {
  const mockDb = { select: vi.fn() }
  const mockHeaders = vi.fn()
  const activeWorkspaceMembers = {
    userId: 'awm.userId',
    workspaceId: 'awm.workspaceId',
    role: 'awm.role',
  }
  return { mockDb, activeWorkspaceMembers, mockHeaders }
})

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  activeWorkspaceMembers,
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}))

// .where().limit() でも await .where() でも解決できる thenable を返す
function selectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  const from = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(whereReturn) })
  return { from }
}

describe('access/membership', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('getWorkspaceRole', () => {
    it('active membership の row があればその role を返す', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))
      const { getWorkspaceRole } = await import('./membership')
      await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBe('admin')
    })

    it('active view に row が無い（非活性・非所属）なら null を返す', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      mockDb.select.mockReturnValueOnce(selectChain([]))
      const { getWorkspaceRole } = await import('./membership')
      await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBeNull()
    })

    it('active_workspace_members ビューを参照する（membership_status 述語は書かない）', async () => {
      mockHeaders.mockResolvedValue(new Headers())
      const chain = selectChain([])
      mockDb.select.mockReturnValueOnce(chain)
      const { getWorkspaceRole } = await import('./membership')
      await getWorkspaceRole('ws-1', 'user-1')
      expect(chain.from).toHaveBeenCalledWith(activeWorkspaceMembers)
    })

    it('同じ request 内の同一 workspace/user は 1 回だけ問い合わせる', async () => {
      const requestHeaders = new Headers()
      mockHeaders.mockResolvedValue(requestHeaders)
      mockDb.select.mockReturnValue(selectChain([{ role: 'admin' }]))
      const { getWorkspaceRole } = await import('./membership')

      await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBe('admin')
      await expect(getWorkspaceRole('ws-1', 'user-1')).resolves.toBe('admin')

      expect(mockDb.select).toHaveBeenCalledTimes(1)
    })
  })

  describe('requireActiveMember', () => {
    it('非活性・非所属（role null）は 403 で弾く', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([]))
      const { requireActiveMember } = await import('./membership')
      const res = await requireActiveMember('ws-1', 'user-1', 'member')
      expect(res).not.toBeNull()
      expect(res!.status).toBe(403)
    })

    it('要求 role 未満は 403 で弾く（guest に member 要求）', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'guest' }]))
      const { requireActiveMember } = await import('./membership')
      const res = await requireActiveMember('ws-1', 'user-1', 'member')
      expect(res!.status).toBe(403)
    })

    it('要求 role 以上なら null（許可）', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'owner' }]))
      const { requireActiveMember } = await import('./membership')
      await expect(requireActiveMember('ws-1', 'user-1', 'admin')).resolves.toBeNull()
    })
  })

  describe('requireWorkspaceAdmin', () => {
    it('active な admin は許可、member は 403', async () => {
      const { requireWorkspaceAdmin } = await import('./membership')
      mockHeaders.mockResolvedValueOnce(new Headers())
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'admin' }]))
      await expect(requireWorkspaceAdmin('ws-1', 'user-1')).resolves.toBeNull()
      mockHeaders.mockResolvedValueOnce(new Headers())
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member' }]))
      const denied = await requireWorkspaceAdmin('ws-1', 'user-1')
      expect(denied!.status).toBe(403)
    })
  })

  describe('filterActiveMemberIds', () => {
    it('空配列は DB を叩かず空 Set を返す', async () => {
      const { filterActiveMemberIds } = await import('./membership')
      await expect(filterActiveMemberIds('ws-1', [])).resolves.toEqual(new Set())
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it('active view に残っている id だけを返す', async () => {
      const chain = selectChain([{ userId: 'u1' }])
      mockDb.select.mockReturnValueOnce(chain)
      const { filterActiveMemberIds } = await import('./membership')
      const result = await filterActiveMemberIds('ws-1', ['u1', 'u2'])
      expect(result).toEqual(new Set(['u1']))
      expect(chain.from).toHaveBeenCalledWith(activeWorkspaceMembers)
    })
  })
})
