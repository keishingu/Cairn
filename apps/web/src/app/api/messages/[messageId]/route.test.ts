// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const MESSAGE_ID = '20000000-0000-0000-0000-000000000001'

const {
  mockGetAuthContext,
  mockDbSelectLimit,
  mockDbUpdateReturning,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbUpdate: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/chat/checkboxes', () => ({
  parseCheckboxes: vi.fn(() => []),
}))
vi.mock('@/lib/chat/mentions', () => ({
  canonicalizeMentions: vi.fn((s: string) => s),
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  isNull: vi.fn(() => 'isNull'),
  inArray: vi.fn(() => 'inArray'),
}))
vi.mock('@cairn/db', () => {
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: mockDbSelectLimit,
          }),
        }),
      }),
    })),
    update: mockDbUpdate,
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
    })),
  }
  mockDbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: mockDbUpdateReturning,
      }),
    }),
  })
  return {
    db,
    messages: {
      id: 'messages.id',
      content: 'messages.content',
      channelId: 'messages.channelId',
      senderId: 'messages.senderId',
      deletedAt: 'messages.deletedAt',
      updatedAt: 'messages.updatedAt',
    },
    channels: {
      id: 'channels.id',
      workspaceId: 'channels.workspaceId',
      projectId: 'channels.projectId',
    },
    tasks: {
      id: 'tasks.id',
      sourceMessageId: 'tasks.sourceMessageId',
      sourceCheckboxIndex: 'tasks.sourceCheckboxIndex',
      status: 'tasks.status',
    },
  }
})

function patchRequest(body: object) {
  return new Request(`http://localhost/api/messages/${MESSAGE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteRequest() {
  return new Request(`http://localhost/api/messages/${MESSAGE_ID}`, {
    method: 'DELETE',
  })
}

describe('PATCH /api/messages/[messageId]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('未認証リクエストは 401 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: new Response(null, { status: 401 }) })
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest({ content: 'new' }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(401)
  })

  it('空のコンテンツは 422 を返す', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest({ content: '' }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(422)
  })

  it('他人のメッセージ編集は 404 を返す（送信者 ID が不一致）', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: OTHER_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockDbSelectLimit.mockResolvedValue([]) // senderId が一致しないため行が返らない
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest({ content: 'new content' }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(404)
    expect(mockDbUpdateReturning).not.toHaveBeenCalled()
  })

  it('送信者本人はメッセージを編集できる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: MESSAGE_ID, content: 'old content' }])
    mockDbUpdateReturning.mockResolvedValue([{ id: MESSAGE_ID, content: 'new content' }])
    const { PATCH } = await import('./route')
    const res = await PATCH(patchRequest({ content: 'new content' }), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ id: MESSAGE_ID, content: 'new content' })
  })
})

describe('DELETE /api/messages/[messageId]', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('未認証リクエストは 401 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: new Response(null, { status: 401 }) })
    const { DELETE } = await import('./route')
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(401)
  })

  it('他人のメッセージ削除は 404 を返す', async () => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: OTHER_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
    mockDbSelectLimit.mockResolvedValue([]) // senderId が不一致で行なし
    const { DELETE } = await import('./route')
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(404)
  })

  it('送信者本人はメッセージをソフトデリートできる', async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: MESSAGE_ID }])
    mockDbUpdateReturning.mockResolvedValue([])
    const { DELETE } = await import('./route')
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ messageId: MESSAGE_ID }) })
    expect(res.status).toBe(204)
  })
})
