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

vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'eq-result') }))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
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
    mockDb.select
      .mockReturnValueOnce(selectChain([{ id: mockUser.id }])) // プロフィール存在
      .mockReturnValueOnce(selectChain([]))                    // メンバーシップなし

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
    mockDb.select
      .mockReturnValueOnce(selectChain([{ id: mockUser.id }]))
      .mockReturnValueOnce(selectChain([{ workspaceId: 'ws-existing' }]))

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

  it('予約済み表示名は 422 で弾く', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '退会したユーザー' }),
      }),
    )

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '退会したユーザー は予約済みの表示名です' })
  })

  it('workspaceName あり・既存メンバーシップがあっても新規ワークスペースを作成する', async () => {
    // プロフィール存在確認のみ（membership チェックは workspaceName 指定時はスキップ）
    mockDb.select.mockReturnValueOnce(selectChain([{ id: mockUser.id }]))

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
    mockDb.select.mockReturnValueOnce(selectChain([]))   // プロフィールなし

    mockDb.insert
      .mockReturnValueOnce(insertChainPlain())                               // profiles
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
    // profiles も含めて insert が5回（profiles / workspaces / channels / projectStatuses / workspaceMembers）
    expect(mockDb.insert).toHaveBeenCalledTimes(5)
  })

  it('非文字列の user_metadata.display_name は email へフォールバックする', async () => {
    mockUser.user_metadata = { display_name: { nested: true }, full_name: 42, name: null }
    mockDb.select.mockReturnValueOnce(selectChain([]))
    const profileInsert = insertChainPlain()

    mockDb.insert
      .mockReturnValueOnce(profileInsert)
      .mockReturnValueOnce(insertChainReturning([{ id: 'ws-new-778' }]))
      .mockReturnValueOnce(insertChainPlain())
      .mockReturnValueOnce(insertChainPlain())
      .mockReturnValueOnce(insertChainPlain())

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceName: 'フォールバック確認' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(profileInsert.values).toHaveBeenCalledWith({
      id: mockUser.id,
      displayName: mockUser.email,
    })
  })
})
