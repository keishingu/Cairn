// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID   = 'ws-00000001'
const PROJ_1  = 'proj-00000001'
const PROJ_2  = 'proj-00000002'
const CH_1    = 'ch-00000001'
const CH_2    = 'ch-00000002'

// --- vi.hoisted ---
const { mockGetAuthContext, mockDb } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: 'ws-00000001' },
    error: null,
  })
  const mockDb = { select: vi.fn() }
  return { mockGetAuthContext, mockDb }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  channels:         { id: 'ch.id', name: 'ch.name', projectId: 'ch.projectId', milestoneId: 'ch.milestoneId' },
  projects:         { id: 'p.id', workspaceId: 'p.workspaceId', title: 'p.title', startDate: 'p.startDate', endDate: 'p.endDate', archived: 'p.archived', createdAt: 'p.createdAt' },
  milestones:       { id: 'm.id', title: 'm.title', startDate: 'm.startDate', endDate: 'm.endDate', completed: 'm.completed', createdAt: 'm.createdAt' },
  projectMembers:   { projectId: 'pm.projectId', userId: 'pm.userId' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
  channelReadStates:{ channelId: 'crs.channelId', userId: 'crs.userId', lastReadAt: 'crs.lastReadAt', unreadMentionCount: 'crs.unreadMentionCount' },
  messages:         { channelId: 'msg.channelId', createdAt: 'msg.createdAt', deletedAt: 'msg.deletedAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  gt: vi.fn(() => 'gt'),
  ne: vi.fn(() => 'ne'),
  count: vi.fn(() => 'count'),
  inArray: vi.fn(() => 'inArray'),
  sql: Object.assign(vi.fn(() => 'sql'), { raw: vi.fn() }),
  asc: vi.fn(() => 'asc'),
}))

/** どんなチェーンでも await できる汎用モックチェーン */
function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'limit', 'orderBy', 'groupBy']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('GET /api/projects/channels', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })
  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID }, error: null })
  })

  it('未認証なら認証エラーを返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('ゲストは参加プロジェクトのチャンネルのみ取得できる', async () => {
    const channelRow = { channelId: CH_1, channelName: 'general', milestoneId: null, completed: null, projectId: PROJ_1, projectTitle: 'プロジェクト1', startDate: null, endDate: null, archived: false }

    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'guest' }]))       // 1. WSロール確認
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))  // 2. ゲストのプロジェクトID取得
      .mockReturnValueOnce(chain([channelRow]))              // 3. チャンネル一覧
      .mockReturnValueOnce(chain([]))                        // 4. 未読数
      .mockReturnValueOnce(chain([]))                        // 5. メンション未読数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { channelId: string; projectId: string }[]
    expect(body).toHaveLength(1)
    expect(body[0]!.channelId).toBe(CH_1)
    expect(body[0]!.projectId).toBe(PROJ_1)
  })

  it('ゲストで参加プロジェクトが0件の場合は空配列を返す', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'guest' }]))  // 1. WSロール確認
      .mockReturnValueOnce(chain([]))                    // 2. ゲストのプロジェクトIDが空

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('通常メンバーはすべてのプロジェクトのチャンネルを取得できる', async () => {
    const ch1 = { channelId: CH_1, channelName: 'general', milestoneId: null, completed: null, projectId: PROJ_1, projectTitle: 'プロジェクト1', startDate: null, endDate: null, archived: false }
    const ch2 = { channelId: CH_2, channelName: 'general', milestoneId: null, completed: null, projectId: PROJ_2, projectTitle: 'プロジェクト2', startDate: null, endDate: null, archived: false }

    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'member' }]))  // 1. WSロール確認
      .mockReturnValueOnce(chain([ch1, ch2]))             // 2. チャンネル一覧（フィルタなし）
      .mockReturnValueOnce(chain([]))                     // 3. 未読数
      .mockReturnValueOnce(chain([]))                     // 4. メンション未読数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { channelId: string }[]
    expect(body).toHaveLength(2)
    // ゲストフィルタの追加selectが呼ばれていないこと（WSロール確認 + 本体の3回 = 4回）
    expect(mockDb.select).toHaveBeenCalledTimes(4)
  })
})
