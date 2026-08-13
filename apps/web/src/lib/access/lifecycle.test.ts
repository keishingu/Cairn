// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, workspaceMembers, activeWorkspaceMembers, documentChunks } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  }
  const workspaceMembers = {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
    membershipStatus: 'wm.membershipStatus',
  }
  const activeWorkspaceMembers = { workspaceId: 'awm.workspaceId', role: 'awm.role' }
  const documentChunks = {
    workspaceId: 'dc.workspaceId',
    sourceType: 'dc.sourceType',
    sourceId: 'dc.sourceId',
  }
  return { mockDb, workspaceMembers, activeWorkspaceMembers, documentChunks }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  workspaceMembers,
  activeWorkspaceMembers,
  documentChunks,
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  count: vi.fn(() => 'count'),
  sql: vi.fn(() => 'sql'),
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

function deleteSpy() {
  const where = vi.fn().mockResolvedValue(undefined)
  mockDb.delete.mockReturnValue({ where })
  return { where }
}

describe('access/lifecycle', () => {
  beforeEach(() => {
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb))
    mockDb.execute.mockResolvedValue(undefined)
    updateSpy()
    deleteSpy()
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
      expect(mockDb.execute).toHaveBeenCalledTimes(1)
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
      expect(mockDb.delete).not.toHaveBeenCalled()
    })

    it('owner でも他に active owner がいれば active owner 行をロックしてから非活性化できる', async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([{ role: 'owner', membershipStatus: 'active' }]))
        .mockReturnValueOnce(selectChain([{ n: 2 }]))
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor')
      expect(res).toEqual({ ok: true })
      // 対象行 + active owner 集合を1クエリでまとめてロックする（デッドロック回避のため2クエリに分けない）
      expect(mockDb.execute).toHaveBeenCalledTimes(1)
      expect(mockDb.execute).toHaveBeenCalledWith('sql')
      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it('通常メンバーは owner カウントを見ずに非活性化でき、検索チャンクを削除して deactivatedBy を記録する', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'member', membershipStatus: 'active' }]))
      const spies = updateSpy()
      const deleteSpies = deleteSpy()
      const { deactivateMembership } = await import('./lifecycle')
      const res = await deactivateMembership('ws', 'u', 'actor-1')
      expect(res).toEqual({ ok: true })
      const setArg = spies.set.mock.calls[0]![0] as { membershipStatus: string; deactivatedBy: string }
      expect(setArg.membershipStatus).toBe('inactive')
      expect(setArg.deactivatedBy).toBe('actor-1')
      expect(mockDb.delete).toHaveBeenCalledTimes(1)
      expect(deleteSpies.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'and' }))
      expect(mockDb.execute).toHaveBeenCalledTimes(1)
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

    it('非活性なら reactivated（同一行を招待ロールで活性化）', async () => {
      mockDb.select.mockReturnValueOnce(selectChain([{ role: 'guest', membershipStatus: 'inactive' }]))
      const spies = updateSpy()
      const { reactivateViaInvite } = await import('./lifecycle')
      await expect(reactivateViaInvite('ws', 'u', 'member')).resolves.toBe('reactivated')
      expect(mockDb.update).toHaveBeenCalledTimes(1)
      expect(spies.set).toHaveBeenCalledWith(expect.objectContaining({ role: 'member', membershipStatus: 'active' }))
    })
  })
})
