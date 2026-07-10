// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = '00000000-0000-0000-0000-000000000010'
const PROJECT_ID = '00000000-0000-0000-0000-000000000100'
const MILESTONE_ID = '00000000-0000-0000-0000-000000000200'

const { mockGetAuthContext, mockRequireWorkspaceMember, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: '00000000-0000-0000-0000-000000000010' },
    error: null,
  }),
  mockRequireWorkspaceMember: vi.fn().mockResolvedValue(null),
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireWorkspaceMember: mockRequireWorkspaceMember }))

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
  for (const m of ['from', 'where', 'limit']) c[m] = vi.fn().mockReturnValue(c)
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
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
    mockRequireWorkspaceMember.mockResolvedValue(null)
  })

  it('別ワークスペースの projectId は見つからない扱いにする', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { PATCH } = await import('./route')
    const res = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ completed: true }) }),
      { params: Promise.resolve({ id: PROJECT_ID, milestoneId: MILESTONE_ID }) },
    )

    expect(res.status).toBe(404)
    expect(mockRequireWorkspaceMember).not.toHaveBeenCalled()
  })

  it('member 未満なら更新できない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    mockRequireWorkspaceMember.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'guest' }), { status: 403 }))

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
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
    mockRequireWorkspaceMember.mockResolvedValue(null)
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
