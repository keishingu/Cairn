// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = '00000000-0000-0000-0000-000000000010'
const PROJECT_ID = '00000000-0000-0000-0000-000000000100'
const MILESTONE_ID = '00000000-0000-0000-0000-000000000200'

const { mockGetAuthContext, mockRequireRole, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: '00000000-0000-0000-0000-000000000010', role: 'member' },
    error: null,
  }),
  mockRequireRole: vi.fn().mockReturnValue(null),
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireRole: mockRequireRole }))
vi.mock('@/lib/chat/post-project-update-message', () => ({ lockProjectUpdateChannel: vi.fn(), postProjectUpdateMessage: vi.fn() }))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels: { id: 'channels.id', milestoneId: 'channels.milestoneId' },
  milestones: {
    id: 'milestones.id',
    projectId: 'milestones.projectId',
    title: 'milestones.title',
    description: 'milestones.description',
    startDate: 'milestones.startDate',
    endDate: 'milestones.endDate',
    startTime: 'milestones.startTime',
    endTime: 'milestones.endTime',
    completed: 'milestones.completed',
  },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
}))

function selectChain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'where', 'limit', 'for']) c[m] = vi.fn().mockReturnValue(c)
  return c
}

function writeChain(result: unknown[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  }
}

describe('PATCH /api/projects/[id]/milestones/[milestoneId]', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' }, error: null })
    mockRequireRole.mockReturnValue(null)
  })

  it('片側の時刻更新を保存済みの同日の期間と照合する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    const update = vi.fn()
    const tx = { select: vi.fn().mockReturnValue(selectChain([{ startDate: '2026-08-10', endDate: '2026-08-10', startTime: '09:00:00', endTime: '12:00:00', completed: false, updatedAt: new Date('2026-08-01T00:00:00.000Z') }])), update }
    mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx))
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ startTime: '13:00' }) }), { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) })
    expect(res.status).toBe(422)
    expect(update).not.toHaveBeenCalled()
  })

  it('一致する世代は更新でき、次の世代を返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }])).mockReturnValueOnce(selectChain([{ id: 'channel-1' }]))
    const previous = { startDate: null, endDate: null, startTime: null, endTime: null, completed: false, updatedAt: new Date('2026-08-01T00:00:00.000Z') }
    const row = { ...previous, id: MILESTONE_ID, projectId: PROJECT_ID, title: '新しい値', description: null, updatedAt: new Date('2026-08-01T00:00:01.000Z') }
    const tx = { select: vi.fn().mockReturnValue(selectChain([previous])), update: vi.fn().mockReturnValue(writeChain([row])) }
    mockDb.transaction.mockImplementationOnce(async fn => fn(tx))
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: '新しい値', expectedUpdatedAt: previous.updatedAt.toISOString() }) }), { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ title: '新しい値', updatedAt: row.updatedAt.toISOString() })
    expect(tx.update).toHaveBeenCalledOnce()
  })

  it('古い世代の編集を409で拒否する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    const update = vi.fn()
    const tx = { select: vi.fn().mockReturnValue(selectChain([{ startDate: null, endDate: null, startTime: null, endTime: null, completed: false, updatedAt: new Date('2026-08-01T00:00:01.000Z') }])), update }
    mockDb.transaction.mockImplementationOnce(async (fn) => fn(tx))
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ title: '編集', expectedUpdatedAt: '2026-08-01T00:00:00.000Z' }) }), { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) })
    expect(res.status).toBe(409)
    expect(update).not.toHaveBeenCalled()
  })

  it('別ワークスペースの projectId は見つからない扱いにする', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) },
    )

    expect(res.status).toBe(404)
    expect(mockRequireRole).not.toHaveBeenCalled()
  })

  it('member 未満なら更新できない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    mockRequireRole.mockReturnValueOnce(new Response(JSON.stringify({ error: 'guest' }), { status: 403 }))

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) },
    )

    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/projects/[id]/milestones/[milestoneId]', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' }, error: null })
    mockRequireRole.mockReturnValue(null)
  })

  it('対象 project の milestone だけを削除する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    mockDb.delete.mockReturnValueOnce(writeChain([{ id: MILESTONE_ID }]))

    const { DELETE } = await import('./route')
    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }),
    })

    expect(res.status).toBe(204)
    expect(mockDb.delete).toHaveBeenCalledTimes(1)
  })
})
