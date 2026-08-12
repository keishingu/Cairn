// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- vi.hoisted: vi.mock ファクトリから参照できるよう先に定義 ---
const { mockUser, mockSupabase, mockDb } = vi.hoisted(() => {
  const mockUser = {
    id: 'user-00000001',
    email: 'test@example.com',
    user_metadata: {},
  }
  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
  }
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(),
  }
  return { mockUser, mockSupabase, mockDb }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn() }),
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'profiles.id' },
  workspaces: {
    id: 'workspaces.id',
    name: 'workspaces.name',
    slug: 'workspaces.slug',
    createdBy: 'workspaces.createdBy',
  },
  workspaceMembers: {
    workspaceId: 'wm.workspaceId',
    userId: 'wm.userId',
    role: 'wm.role',
  },
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
  },
  channels: {
    workspaceId: 'ch.workspaceId',
    type: 'ch.type',
    name: 'ch.name',
  },
  projectStatuses: {
    workspaceId: 'ps.workspaceId',
    name: 'ps.name',
    color: 'ps.color',
    sortOrder: 'ps.sortOrder',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq-result'),
  sql: vi.fn(() => 'sql-result'),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/access/account-lifecycle-lock', () => ({
  lockAccountLifecycle: vi.fn().mockResolvedValue('usable'),
}))

/** 単一結果を返す select チェーン */
function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

/** .values() を await するだけの insert チェーン */
function insertChainPlain() {
  return { values: vi.fn().mockResolvedValue([]) }
}

/** .values().returning() を使う insert チェーン */
function insertChainReturning(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  }
}

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test'
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) =>
      callback(mockDb),
    )
  })

  afterEach(() => {
    delete process.env['DATABASE_URL']
    vi.clearAllMocks()
  })

  it('不正な JSON には 400 を返す', async () => {
    const { POST } = await import('./route')

    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        body: 'not-json',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('workspaceName なし・メンバーシップなし → needsWorkspace: true', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, needsWorkspace: true })
  })

  it('workspaceName なし・メンバーシップあり → needsWorkspace: false', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ workspaceId: 'ws-existing' }]))

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    await expect(res.json()).resolves.toEqual({ ok: true, needsWorkspace: false })
  })

  it('workspaceName あり・既存メンバーシップがあっても新規ワークスペースを作成する', async () => {
    mockDb.insert
      .mockReturnValueOnce(insertChainReturning([{ id: 'new-ws-id-999' }])) // workspaces
      .mockReturnValueOnce(insertChainPlain())                               // channels
      .mockReturnValueOnce(insertChainPlain())                               // projectStatuses
      .mockReturnValueOnce(insertChainPlain())                               // workspaceMembers

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceName: '新チーム' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; needsWorkspace: boolean; workspaceId: string }
    expect(body.ok).toBe(true)
    expect(body.needsWorkspace).toBe(false)
    expect(body.workspaceId).toBe('new-ws-id-999')
    // insert が4回呼ばれること（workspaces / channels / projectStatuses / workspaceMembers）
    expect(mockDb.insert).toHaveBeenCalledTimes(4)
  })

  it('workspaceName あり・プロフィール未作成 → プロフィールも同時に作成する', async () => {
    const { lockAccountLifecycle } = await import('@/lib/access/account-lifecycle-lock')
    vi.mocked(lockAccountLifecycle).mockResolvedValueOnce('missing')

    mockDb.insert
      .mockReturnValueOnce(insertChainReturning([{ id: 'ws-new-777' }]))    // workspaces
      .mockReturnValueOnce(insertChainPlain())                               // channels
      .mockReturnValueOnce(insertChainPlain())                               // projectStatuses
      .mockReturnValueOnce(insertChainPlain())                               // workspaceMembers

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceName: 'プロフィール作成テスト' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockDb.execute).toHaveBeenCalled()
    expect(mockDb.insert).toHaveBeenCalledTimes(4)
  })

  it('退会開始済みなら新規ワークスペースを作成しない', async () => {
    const { lockAccountLifecycle } = await import('@/lib/access/account-lifecycle-lock')
    vi.mocked(lockAccountLifecycle).mockResolvedValueOnce('deleting')

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceName: '復活させない' }),
      }),
    )

    expect(res.status).toBe(410)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
