// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID   = 'ws-00000001'
const PROJ_1  = 'proj-00000001'
const PROJ_2  = 'proj-00000002'

// --- vi.hoisted ---
const { mockGetAuthContext, mockDb, selectChains } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: '00000000-0000-0000-0000-000000000001', workspaceId: 'ws-00000001', role: 'member' },
    error: null,
  })
  const mockDb = { select: vi.fn() }
  const selectChains: Record<string, unknown>[] = []
  return { mockGetAuthContext, mockDb, selectChains }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  projects:       { id: 'p.id', workspaceId: 'p.workspaceId', title: 'p.title', description: 'p.description', startDate: 'p.startDate', endDate: 'p.endDate', archived: 'p.archived', createdBy: 'p.createdBy', coverPhotoUrl: 'p.coverPhotoUrl', location: 'p.location', placeId: 'p.placeId' },
  projectStatuses:{ id: 'ps.id', name: 'ps.name', color: 'ps.color' },
  projectMembers: { projectId: 'pm.projectId', userId: 'pm.userId', createdAt: 'pm.createdAt' },
  tasks:          { projectId: 'tk.projectId', channelId: 'tk.channelId', status: 'tk.status' },
  channels:       { id: 'ch.id', isPrivate: 'ch.isPrivate' },
  channelMembers: { channelId: 'cm.channelId', userId: 'cm.userId' },
  profiles:       { id: 'pr.id', displayName: 'pr.displayName' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role', displayName: 'wm.displayName', avatarUrl: 'wm.avatarUrl' },
  activeWorkspaceMembers: { workspaceId: 'awm.workspaceId', userId: 'awm.userId', role: 'awm.role' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn((a: unknown, b: unknown) => ({ and: [a, b] })),
  count: vi.fn(() => 'count'),
  inArray: vi.fn(() => 'inArray'),
  sql: Object.assign(vi.fn(() => 'sql'), { raw: vi.fn() }),
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
  selectChains.push(c)
  return c
}

describe('GET /api/projects', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
  })
  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
    selectChains.length = 0
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' }, error: null })
  })

  it('未認証なら認証エラーを返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('ゲストは参加プロジェクトのみ取得できる', async () => {
    // ロールは ctx.role で判定するため WSロール確認クエリは発行しない（P2）
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'guest' }, error: null })
    const project = { id: PROJ_1, title: 'テスト', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }

    mockDb.select
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))   // 1. ゲストのプロジェクトID取得
      .mockReturnValueOnce(chain([project]))                  // 2. プロジェクト一覧
      .mockReturnValueOnce(chain([]))                         // 3. メンバー数
      .mockReturnValueOnce(chain([]))                         // 4. メンバー名
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))   // 5. 自分の参加プロジェクト
      .mockReturnValueOnce(chain([]))                         // 6. タスク数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }[]
    expect(body).toHaveLength(1)
    expect(body[0]!.id).toBe(PROJ_1)
    // ゲストのプロジェクトID取得クエリ（innerJoin あり）が発行される
    expect(selectChains[0]?.['innerJoin']).toHaveBeenCalledTimes(1)
  })

  it('ゲストで参加プロジェクトが0件の場合は空配列を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'guest' }, error: null })
    mockDb.select
      .mockReturnValueOnce(chain([]))                    // 1. ゲストのプロジェクトIDが空

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toEqual([])
    // ゲストフィルタで早期リターンするためDB呼び出しは1回のみ（WSロール確認クエリは廃止）
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it('通常メンバーはすべてのプロジェクトを取得できる（ゲストフィルタなし）', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' }, error: null })
    const proj1 = { id: PROJ_1, title: 'プロジェクト1', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }
    const proj2 = { id: PROJ_2, title: 'プロジェクト2', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }

    mockDb.select
      .mockReturnValueOnce(chain([proj1, proj2]))              // 1. プロジェクト一覧（フィルタなし）
      .mockReturnValueOnce(chain([]))                          // 2. メンバー数
      .mockReturnValueOnce(chain([]))                          // 3. メンバー名
      .mockReturnValueOnce(chain([]))                          // 4. 自分の参加プロジェクト
      .mockReturnValueOnce(chain([]))                          // 5. タスク数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }[]
    expect(body).toHaveLength(2)
    // ゲストフィルタの追加selectも WSロール確認クエリも呼ばれない（本体の5回のみ）
    expect(mockDb.select).toHaveBeenCalledTimes(5)
  })

  it('可視プロジェクトのみに集計クエリを絞る', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WS_ID, role: 'member' }, error: null })
    const proj1 = { id: PROJ_1, title: 'プロジェクト1', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }
    const proj2 = { id: PROJ_2, title: 'プロジェクト2', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }

    mockDb.select
      .mockReturnValueOnce(chain([proj1, proj2]))
      .mockReturnValueOnce(chain([{ projectId: PROJ_1, n: 3 }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))
      .mockReturnValueOnce(chain([{ projectId: PROJ_1, total: 5, completed: 2 }]))

    const drizzle = await import('drizzle-orm')
    const { GET } = await import('./route')
    await GET()

    expect(drizzle.inArray).toHaveBeenCalledWith('pm.projectId', [PROJ_1, PROJ_2])
    expect(drizzle.inArray).toHaveBeenCalledWith('tk.projectId', [PROJ_1, PROJ_2])
    expect(selectChains[1]?.['where']).toHaveBeenCalledTimes(1)
    expect(selectChains[2]?.['where']).toHaveBeenCalledTimes(1)
    expect(selectChains[4]?.['where']).toHaveBeenCalledTimes(1)
  })
})
