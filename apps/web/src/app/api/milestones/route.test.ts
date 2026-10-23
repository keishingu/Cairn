// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = '00000000-0000-0000-0000-000000000010'
const PROJECT_ID = '00000000-0000-0000-0000-000000000100'
const MILESTONE_ID = '00000000-0000-0000-0000-000000000200'
const CHANNEL_ID = '00000000-0000-0000-0000-000000000300'

const { mockGetAuthContext, mockDb } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: '00000000-0000-0000-0000-000000000010' },
    error: null,
  }),
  mockDb: { select: vi.fn() },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  activeWorkspaceMembers: { workspaceId: 'awm.workspaceId', userId: 'awm.userId', role: 'awm.role' },
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
  projectMembers: { projectId: 'projectMembers.projectId', userId: 'projectMembers.userId' },
  projects: { id: 'projects.id', workspaceId: 'projects.workspaceId', title: 'projects.title', createdAt: 'projects.createdAt' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  eq: vi.fn(() => 'eq'),
  inArray: vi.fn(() => 'inArray'),
  sql: Object.assign(vi.fn(() => 'sql'), { raw: vi.fn() }),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'innerJoin', 'where', 'limit', 'orderBy']) c[m] = vi.fn().mockReturnValue(c)
  return c
}

describe('GET /api/milestones', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
  })

  it('未認証なら認証エラーを返す', async () => {
    mockGetAuthContext.mockResolvedValueOnce({ ctx: null, error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) })

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('通常メンバーはワークスペース内のマイルストーンを取得できる', async () => {
    const milestone = {
      id: MILESTONE_ID,
      projectId: PROJECT_ID,
      projectTitle: '北アルプス',
      title: '訪問',
      description: null,
      startDate: '2026-07-14',
      endDate: '2026-07-14',
      startTime: '10:00',
      endTime: '12:00',
      completed: false,
      channelId: CHANNEL_ID,
    }
    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'member' }]))
      .mockReturnValueOnce(chain([milestone]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([milestone])
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('ゲストは参加プロジェクトのマイルストーンだけを取得できる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'guest' }]))
      .mockReturnValueOnce(chain([{ projectId: PROJECT_ID }]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([])
    expect(mockDb.select).toHaveBeenCalledTimes(3)
  })

  it('ゲストで参加プロジェクトが0件なら空配列を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'guest' }]))
      .mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([])
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })
})
