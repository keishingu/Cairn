// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'

const { mockSelect, mockAnd, mockEq } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockAnd: vi.fn((...conditions) => conditions),
  mockEq: vi.fn((column, value) => ({ column, value })),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn().mockResolvedValue({
    ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID },
    error: null,
  }),
}))
vi.mock('@cairn/db', () => ({
  db: { select: mockSelect },
  aiConversations: {
    id: 'ai_conversations.id',
    workspaceId: 'ai_conversations.workspace_id',
    createdBy: 'ai_conversations.created_by',
    title: 'ai_conversations.title',
    createdAt: 'ai_conversations.created_at',
  },
  aiMessages: {
    id: 'ai_messages.id',
    conversationId: 'ai_messages.conversation_id',
    role: 'ai_messages.role',
    content: 'ai_messages.content',
    annotations: 'ai_messages.annotations',
    toolInvocations: 'ai_messages.tool_invocations',
    createdAt: 'ai_messages.created_at',
  },
}))
vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  asc: vi.fn(),
  desc: vi.fn(),
  eq: mockEq,
}))

function query(result: unknown[]) {
  const promise = Promise.resolve(result)
  const value: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['from', 'where', 'limit', 'orderBy']) value[method] = vi.fn(() => value)
  return value
}

describe('/ai会話の所有者認可', () => {
  afterEach(() => vi.clearAllMocks())

  test('会話一覧はworkspaceだけでなく作成者でも絞り込む', async () => {
    mockSelect.mockReturnValueOnce(query([]))
    const { GET } = await import('./route')

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.workspace_id', WORKSPACE_ID)
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.created_by', USER_ID)
  })

  test('会話本文の取得はworkspaceだけでなく作成者でも認可する', async () => {
    mockSelect.mockReturnValueOnce(query([{ id: 'conversation-1' }])).mockReturnValueOnce(query([]))
    const { GET } = await import('./[id]/messages/route')

    const response = await GET(new Request('http://localhost/api/ai/conversations/conversation-1/messages'), {
      params: Promise.resolve({ id: 'conversation-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.workspace_id', WORKSPACE_ID)
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.created_by', USER_ID)
  })
})
