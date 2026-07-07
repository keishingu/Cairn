// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'
const TARGET_USER_ID = '30000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockRequireChannelAccess,
  mockDbSelect,
  mockDbInsert,
  mockEq,
  mockAnd,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockEq: vi.fn(() => Symbol('eq')),
  mockAnd: vi.fn(() => Symbol('and')),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireChannelAccess: mockRequireChannelAccess,
}))

vi.mock('@cairn/db', () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  channelMembers: { userId: 'channelMembers.userId', channelId: 'channelMembers.channelId' },
  channelReadStates: { userId: 'channelReadStates.userId', channelId: 'channelReadStates.channelId', lastReadAt: 'channelReadStates.lastReadAt' },
  profiles: { id: 'profiles.id', kind: 'profiles.kind' },
  workspaceMembers: { userId: 'workspaceMembers.userId', workspaceId: 'workspaceMembers.workspaceId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
}))

function ctxRouteParams() {
  return { params: Promise.resolve({ channelId: CHANNEL_ID }) }
}

function mockSelectResults(...results: unknown[]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return builder
  })
}

function mockInsertChain() {
  const builder = {
    values: () => builder,
    onConflictDoNothing: () => Promise.resolve(undefined),
  }
  mockDbInsert.mockReturnValue(builder)
}

function postRequest(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/channels/[channelId]/members のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('アクセス権の無いチャンネルでは GET が 403 を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  it('GET は DB エラー時にサイレントに空配列を返さず 500 を返す', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockDbSelect.mockImplementation(() => {
      throw new Error('boom')
    })
    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/'), ctxRouteParams())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal server error' })
  })

  it('アクセス権の無いチャンネルでは POST が 403 を返し、メンバーを追加できない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )
    const { POST } = await import('./route')
    const res = await POST(postRequest({ userId: TARGET_USER_ID }), ctxRouteParams())
    expect(res.status).toBe(403)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('他ワークスペースの userId を指定すると 422 を返し、channelMembers に追加されない', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults([]) // workspaceMembers に該当ユーザーなし
    const { POST } = await import('./route')
    const res = await POST(postRequest({ userId: TARGET_USER_ID }), ctxRouteParams())
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '指定されたユーザーは人間メンバーではありません' })
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('bot profile を指定すると 422 を返し、channelMembers に追加されない', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults([])
    const { POST } = await import('./route')
    const res = await POST(postRequest({ userId: TARGET_USER_ID }), ctxRouteParams())
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: '指定されたユーザーは人間メンバーではありません' })
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('自ワークスペースのメンバーは正常にチャンネルへ追加できる', async () => {
    mockRequireChannelAccess.mockResolvedValue(null)
    mockSelectResults([{ userId: TARGET_USER_ID }])
    mockInsertChain()
    const { POST } = await import('./route')
    const res = await POST(postRequest({ userId: TARGET_USER_ID }), ctxRouteParams())
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ userId: TARGET_USER_ID, channelId: CHANNEL_ID })
  })
})
