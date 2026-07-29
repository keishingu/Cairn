// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_REQUEST_BODY_BYTES } from './message-input'

const { mockGetAuthContext, mockIsBillingEnabled, mockResolveUploadEntitlements } = vi.hoisted(
  () => ({
    mockGetAuthContext: vi.fn().mockResolvedValue({
      ctx: {
        userId: '00000000-0000-0000-0000-000000000001',
        workspaceId: '00000000-0000-0000-0000-000000000010',
      },
      error: null,
    }),
    mockIsBillingEnabled: vi.fn(),
    mockResolveUploadEntitlements: vi.fn(),
  }),
)

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))

describe('POST /api/ai/conversations/[id]/messages', () => {
  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key'
    mockIsBillingEnabled.mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env['OPENAI_API_KEY']
    vi.clearAllMocks()
  })

  it('大きすぎる payload は 413 を返す', async () => {
    const { POST } = await import('./route')

    const oversizedBody = JSON.stringify({
      messages: [{ role: 'user', content: 'a'.repeat(MAX_REQUEST_BODY_BYTES) }],
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

  it('課金環境では支援者でないユーザーの能動AI依頼を拒否する', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({
      isActiveSupporter: false,
      workspaceState: 'funded',
    })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '質問' }] }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error:
        'AIへの依頼は、石を積んでいるメンバーのみ利用できます。設定の請求から石を積んでください。',
    })
  })

  it('課金環境では必要クレジット未満の能動AI依頼を拒否する', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({
      isActiveSupporter: true,
      creditBalance: 9,
    })
    const { POST } = await import('./route')

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '質問' }] }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({
      error: 'ワークスペースのクレジットが不足しています。設定の請求から石を追加してください。',
    })
  })

  it('ストリーム失敗後は途中のassistant応答を保存しない', async () => {
    const { shouldPersistFinishedAssistantMessage } = await import('./message-stream-lifecycle')

    expect(shouldPersistFinishedAssistantMessage(true)).toBe(false)
    expect(shouldPersistFinishedAssistantMessage(false)).toBe(true)
  })
})
