// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '00000000-0000-0000-0000-000000000099'
const USER_A = '00000000-0000-0000-0000-000000000011'
const USER_B = '00000000-0000-0000-0000-000000000012'

const { mockGetAuthContext, mockRequireWorkspaceMember, mockDb, mockInngestSend } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
    },
    error: null,
  })
  const mockRequireWorkspaceMember = vi.fn().mockResolvedValue(null)
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  }
  const mockInngestSend = vi.fn().mockResolvedValue(undefined)
  return { mockGetAuthContext, mockRequireWorkspaceMember, mockDb, mockInngestSend }
})

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireWorkspaceMember: mockRequireWorkspaceMember }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))
vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'pr.id', displayName: 'pr.displayName' },
  projectMembers: {
    userId: 'pm.userId',
    role: 'pm.role',
    attendance: 'pm.attendance',
    createdAt: 'pm.createdAt',
    projectId: 'pm.projectId',
  },
  projects: { id: 'p.id', workspaceId: 'p.workspaceId' },
  workspaceMembers: { id: 'wm.id', userId: 'wm.userId', workspaceId: 'wm.workspaceId', avatarUrl: 'wm.avatarUrl' },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  inArray: vi.fn(() => 'inArray'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'limit', 'orderBy']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

describe('POST /api/projects/[id]/members', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('userIds が配列でない場合は 422 を返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: USER_A, role: 'member' }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'userIds must be an array' })
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('userIds に文字列以外が含まれる場合は 422 を返す', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [123], role: 'member' }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'userIds must contain only non-empty strings' })
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('複数ユーザーを一度に追加できる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: PROJECT_ID }]))
      .mockReturnValueOnce(chain([{ userId: USER_A }, { userId: USER_B }]))
      .mockReturnValueOnce(chain([
        { userId: USER_A, displayName: 'Alice', avatarUrl: null },
        { userId: USER_B, displayName: 'Bob', avatarUrl: 'https://example.com/b.png' },
      ]))

    let insertedValues: unknown[] = []
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockImplementation((values: unknown[]) => {
        insertedValues = values
        return {
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { userId: USER_A, role: 'member', attendance: 'attending', addedAt: new Date('2026-06-24T00:00:00Z') },
              { userId: USER_B, role: 'member', attendance: 'attending', addedAt: new Date('2026-06-24T00:00:00Z') },
            ]),
          }),
        }
      }),
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [USER_A, USER_B], role: 'member' }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(201)
    expect(insertedValues).toHaveLength(2)
    const body = await res.json() as Array<{ userId: string; displayName: string }>
    expect(body).toEqual([
      { userId: USER_A, displayName: 'Alice', avatarUrl: null, role: 'member', attendance: 'attending', addedAt: '2026-06-24' },
      { userId: USER_B, displayName: 'Bob', avatarUrl: 'https://example.com/b.png', role: 'member', attendance: 'attending', addedAt: '2026-06-24' },
    ])
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'project/upserted',
      data: {
        projectId: PROJECT_ID,
        workspaceId: '00000000-0000-0000-0000-000000000010',
      },
    })
  })

  it('単一 userId でも従来どおり追加できる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: PROJECT_ID }]))
      .mockReturnValueOnce(chain([{ userId: USER_A }]))
      .mockReturnValueOnce(chain([{ userId: USER_A, displayName: 'Alice', avatarUrl: null }]))

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { userId: USER_A, role: 'leader', attendance: 'attending', addedAt: new Date('2026-06-24T00:00:00Z') },
          ]),
        }),
      }),
    })

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_A, role: 'leader' }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { userId: string; role: string }
    expect(body.userId).toBe(USER_A)
    expect(body.role).toBe('leader')
  })
})
