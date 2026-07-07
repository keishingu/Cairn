// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, workspaceMembers, activeWorkspaceMembers } = vi.hoisted(() => {
  const mockDb = { select: vi.fn(), update: vi.fn() }
  const workspaceMembers = {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  }
  const activeWorkspaceMembers = { workspaceId: 'awm.workspaceId', role: 'awm.role' }
  return { mockDb, workspaceMembers, activeWorkspaceMembers }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers,
  activeWorkspaceMembers,
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  count: vi.fn(() => 'count'),
}))

// select().from().where().limit() / select().from().where() の両方を解決する
function selectChain(result: unknown[]) {
  const whereReturn = Object.assign(Promise.resolve(result), {
    limit: vi.fn().mockResolvedValue(result),
  })
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(whereReturn) }) }
}

function updateSpy() {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where }
}

describe('access/lifecycle', () => {
  beforeEach(() => {
    updateSpy()
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('deactivateMembership', () => {
    it('存在しないメンバーは 404', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([]))
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor')
      expect(res).toEqual({ ok: false, status: 404, error: 'Member not found' })
    })

    it('既に非活性なら 422', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'inactive' }]))
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor')
      expect(res.ok).toBe(false)
      expect((res as { status: number }).status).toBe(422)
    })

    it('最後の active owner は非活性化できない（422）', async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }])) // target
        .mockReturnValueOnce(selectChain([{ n: 1 }])) // active owner count
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor')
      expect(res.ok).toBe(false)
      expect((res as { status: number }).status).toBe(422)
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it('owner でも他に active owner がいれば非活性化できる', async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
        .mockReturnValueOnce(selectChain([{ n: 2 }]))
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor')
      expect(res).toEqual({ ok: true })
      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it('通常メンバーは owner カウントを見ずに非活性化でき、deactivatedBy を記録する', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
      const spies = updateSpy()
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor-1')
      expect(res).toEqual({ ok: true })
      const setArg = spies.set.mock.calls[0]![0] as { membershipStatus: string; deactivatedBy: string }
      expect(setArg.membershipStatus).toBe('inactive')
      expect(setArg.deactivatedBy).toBe('actor-1')
    })
  })

  describe('reactivateMembership', () => {
    it('既に活性なら 422', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
      const { reactivateMembership } = await import('./lifecycle')
      const res = await reactivateMembership('ws', 'u')
      expect((res as { status: number }).status).toBe(422)
    })

    it('非活性メンバーを活性化し、deactivatedAt/By を消す', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'inactive' }]))
      const spies = updateSpy()
      const { reactivateMembership } = await import('./lifecycle')
      const res = await reactivateMembership('ws', 'u')
      expect(res).toEqual({ ok: true })
      const setArg = spies.set.mock.calls[0]![0] as { membershipStatus: string; deactivatedAt: null; deactivatedBy: null }
      expect(setArg).toMatchObject({ membershipStatus: 'active', deactivatedAt: null, deactivatedBy: null })
    })
  })

  describe('reactivateViaInvite', () => {
    it('メンバーシップが無ければ none', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([]))
      const { reactivateViaInvite } = await import('./lifecycle')
      await expect(reactivateViaInvite('ws', 'u')).resolves.toBe('none')
    })

    it('既に活性なら already-active（更新しない）', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
      const { reactivateViaInvite } = await import('./lifecycle')
      await expect(reactivateViaInvite('ws', 'u')).resolves.toBe('already-active')
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it('非活性なら reactivated（同一行を活性化）', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'guest', membershipStatus: 'inactive' }]))
      updateSpy()
      const { reactivateViaInvite } = await import('./lifecycle')
      await expect(reactivateViaInvite('ws', 'u')).resolves.toBe('reactivated')
      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })
  })
})
