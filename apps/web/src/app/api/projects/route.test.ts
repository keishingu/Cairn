// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID   = 'ws-00000001'
const PROJ_1  = 'proj-00000001'
const PROJ_2  = 'proj-00000002'

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
  projects:       { id: 'p.id', workspaceId: 'p.workspaceId', title: 'p.title', description: 'p.description', startDate: 'p.startDate', endDate: 'p.endDate', archived: 'p.archived', createdBy: 'p.createdBy', coverPhotoUrl: 'p.coverPhotoUrl', location: 'p.location', placeId: 'p.placeId' },
  projectStatuses:{ id: 'ps.id', name: 'ps.name', color: 'ps.color' },
  projectMembers: { projectId: 'pm.projectId', userId: 'pm.userId', createdAt: 'pm.createdAt' },
  tasks:          { projectId: 'tk.projectId', status: 'tk.status' },
  profiles:       { id: 'pr.id', displayName: 'pr.displayName' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role', avatarUrl: 'wm.avatarUrl' },
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
  return c
}

describe('GET /api/projects', () => {
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

  it('ゲストは参加プロジェクトのみ取得できる', async () => {
    const project = { id: PROJ_1, title: 'テスト', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }

    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'guest' }]))        // 1. WSロール確認
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))   // 2. ゲストのプロジェクトID取得
      .mockReturnValueOnce(chain([project]))                  // 3. プロジェクト一覧
      .mockReturnValueOnce(chain([]))                         // 4. メンバー数
      .mockReturnValueOnce(chain([]))                         // 5. メンバー名
      .mockReturnValueOnce(chain([{ projectId: PROJ_1 }]))   // 6. 自分の参加プロジェクト
      .mockReturnValueOnce(chain([]))                         // 7. タスク数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }[]
    expect(body).toHaveLength(1)
    expect(body[0]!.id).toBe(PROJ_1)
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
    // ゲストフィルタで早期リターンするためDB呼び出しは2回のみ
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('通常メンバーはすべてのプロジェクトを取得できる（ゲストフィルタなし）', async () => {
    const proj1 = { id: PROJ_1, title: 'プロジェクト1', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }
    const proj2 = { id: PROJ_2, title: 'プロジェクト2', description: null, startDate: null, endDate: null, archived: false, createdBy: USER_ID, coverPhotoUrl: null, location: null, placeId: null }

    mockDb.select
      .mockReturnValueOnce(chain([{ role: 'member' }]))        // 1. WSロール確認
      .mockReturnValueOnce(chain([proj1, proj2]))              // 2. プロジェクト一覧（フィルタなし）
      .mockReturnValueOnce(chain([]))                          // 3. メンバー数
      .mockReturnValueOnce(chain([]))                          // 4. メンバー名
      .mockReturnValueOnce(chain([]))                          // 5. 自分の参加プロジェクト
      .mockReturnValueOnce(chain([]))                          // 6. タスク数

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string }[]
    expect(body).toHaveLength(2)
    // ゲストフィルタの追加selectが呼ばれていないこと（WSロール確認 + 本体の5回 = 6回）
    expect(mockDb.select).toHaveBeenCalledTimes(6)
  })
})
