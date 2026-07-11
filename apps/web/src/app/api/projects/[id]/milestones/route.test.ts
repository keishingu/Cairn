// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = '00000000-0000-0000-0000-000000000010'
const PROJECT_ID = '00000000-0000-0000-0000-000000000100'
const MILESTONE_ID = '00000000-0000-0000-0000-000000000200'
const CHANNEL_ID = '00000000-0000-0000-0000-000000000300'

const { mockGetAuthContext, mockRequireProjectAccess, mockRequireWorkspaceMember, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: '00000000-0000-0000-0000-000000000010' },
    error: null,
  }),
  mockRequireProjectAccess: vi.fn().mockResolvedValue(null),
  mockRequireWorkspaceMember: vi.fn().mockResolvedValue(null),
  mockDb: { select: vi.fn(), transaction: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({
  requireProjectAccess: mockRequireProjectAccess,
  requireWorkspaceMember: mockRequireWorkspaceMember,
}))

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
    createdAt: 'milestones.createdAt',
  },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  sql: Object.assign(vi.fn(() => 'sql'), { raw: vi.fn() }),
}))

function selectChain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'innerJoin', 'where', 'limit', 'orderBy']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

function insertChain(result: unknown[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  }
}

describe('GET /api/projects/[id]/milestones', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireWorkspaceMember.mockResolvedValue(null)
  })

  it('別ワークスペースの projectId は見つからない扱いにする', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: PROJECT_ID }) })

    expect(res.status).toBe(404)
    expect(mockRequireProjectAccess).not.toHaveBeenCalled()
  })

  it('ゲストが参加していないプロジェクトなら 403 を返す', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    mockRequireProjectAccess.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }))

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: PROJECT_ID }) })

    expect(res.status).toBe(403)
  })
})

describe('POST /api/projects/[id]/milestones', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
    mockRequireProjectAccess.mockResolvedValue(null)
    mockRequireWorkspaceMember.mockResolvedValue(null)
  })

  it('member 未満なら作成できない', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    mockRequireWorkspaceMember.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'guest' }), { status: 403 }))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ title: '高所順応' }) }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(403)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('マイルストーンとチャンネルを同一トランザクションで作成する', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: PROJECT_ID }]))
    const milestone = {
      id: MILESTONE_ID,
      projectId: PROJECT_ID,
      title: '高所順応',
      description: null,
      startDate: '2026-08-01',
      endDate: null,
      startTime: '09:30:00',
      endTime: null,
      completed: false,
    }
    const tx = {
      insert: vi.fn()
        .mockReturnValueOnce(insertChain([milestone]))
        .mockReturnValueOnce(insertChain([{ id: CHANNEL_ID }])),
    }
    mockDb.transaction.mockImplementationOnce(async (callback) => callback(tx))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ title: '高所順応', startDate: '2026-08-01', startTime: '09:30' }) }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(201)
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(tx.insert).toHaveBeenCalledTimes(2)
    const body = await res.json() as { id: string; channelId: string }
    expect(body).toMatchObject({ id: MILESTONE_ID, channelId: CHANNEL_ID })
  })
})
