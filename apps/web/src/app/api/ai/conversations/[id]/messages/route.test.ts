// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_REQUEST_BODY_BYTES } from './message-input'

const { mockGetAuthContext } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn().mockResolvedValue({
    ctx: {
      userId: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000010',
    },
    error: null,
  }),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/ai/chat-rate-limit', () => ({
  enforceAiChatRateLimit: vi.fn(async () => ({
    allowed: true,
    limit: 12,
    remaining: 11,
    resetAt: 1_800_000_000,
    retryAfterSeconds: 60,
  })),
}))

describe('POST /api/ai/conversations/[id]/messages', () => {
  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key'
  })

  afterEach(() => {
    delete process.env['OPENAI_API_KEY']
    vi.clearAllMocks()
  })

  it('大きすぎる payload は 413 を返す', async () => {
    const { POST } = await import('./route')

    const oversizedBody = JSON.stringify({
      messages: [
        { role: 'user', content: 'a'.repeat(MAX_REQUEST_BODY_BYTES) },
      ],
    })

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: oversizedBody,
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      error: `リクエスト本文は ${MAX_REQUEST_BODY_BYTES} bytes 以内で指定してください`,
    })
  })

  it('user / assistant 以外のロールを含む payload は 422 を返す', async () => {
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'tool', content: '検索結果' },
            { role: 'user', content: '質問' },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: 'messages は user/assistant の文字列メッセージ配列で指定してください',
    })
  })

  it('rate limit 超過時は 429 を返す', async () => {
    const { enforceAiChatRateLimit } = await import('@/lib/ai/chat-rate-limit')
    vi.mocked(enforceAiChatRateLimit).mockResolvedValueOnce({
      allowed: false,
      limit: 12,
      remaining: 0,
      resetAt: 1_800_000_000,
      retryAfterSeconds: 42,
    })

    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: '質問' },
          ],
        }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    await expect(response.json()).resolves.toEqual({
      error: 'AIチャットの送信回数が上限に達しました。少し待ってから再試行してください。',
    })
  })
})
