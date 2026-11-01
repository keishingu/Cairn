// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000010'
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000100'

const { mockUpdateSet, mockReturning, mockEq } = vi.hoisted(() => ({
  mockUpdateSet: vi.fn(),
  mockReturning: vi.fn(),
  mockEq: vi.fn((column: string, value: unknown) => ({ column, value })),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn().mockResolvedValue({ ctx: { userId: USER_ID, workspaceId: WORKSPACE_ID }, error: null }),
}))
vi.mock('@/lib/ai/chat-model', () => ({
  loadWorkspaceChatModels: async () => ({ defaultModel: 'gpt-5', allowedModels: ['gpt-5', 'claude-sonnet-5-5'] }),
}))
vi.mock('@cairn/db', () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values)
        return { where: () => ({ returning: mockReturning }) }
      },
    }),
  },
  aiConversations: {
    id: 'ai_conversations.id',
    workspaceId: 'ai_conversations.workspace_id',
    createdBy: 'ai_conversations.created_by',
    title: 'ai_conversations.title',
    createdAt: 'ai_conversations.created_at',
  },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn((...conditions: unknown[]) => conditions), eq: mockEq }))

const patch = (body: unknown) =>
  new Request(`http://localhost/api/ai/conversations/${CONVERSATION_ID}`, { method: 'PATCH', body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: CONVERSATION_ID }) }

describe('PATCH /api/ai/conversations/[id]', () => {
  afterEach(() => vi.clearAllMocks())

  test('許可されたモデルに切り替え、本人の会話だけを更新する', async () => {
    mockReturning.mockResolvedValueOnce([{ id: CONVERSATION_ID, title: '計画', createdAt: new Date('2026-11-01T00:00:00Z') }])
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ model: 'claude-sonnet-5-5' }), params)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: CONVERSATION_ID, model: 'claude-sonnet-5-5' })
    expect(mockUpdateSet).toHaveBeenCalledWith({ model: 'claude-sonnet-5-5' })
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.created_by', USER_ID)
    expect(mockEq).toHaveBeenCalledWith('ai_conversations.workspace_id', WORKSPACE_ID)
  })

  test('owner が許可していないモデルには切り替えず 422 にする', async () => {
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ model: 'claude-opus-5-5' }), params)

    expect(response.status).toBe(422)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  test('存在しないモデル名は 422 にする', async () => {
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ model: 'claude-haiku-5-5' }), params)

    expect(response.status).toBe(422)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  test('他人の会話・見つからない会話は 404 にする', async () => {
    mockReturning.mockResolvedValueOnce([])
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ model: 'gpt-5' }), params)

    expect(response.status).toBe(404)
  })
})
