// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_REQUEST_BODY_BYTES } from './message-input'

const {
  mockGetAuthContext,
  mockIsBillingEnabled,
  mockResolveUploadEntitlements,
  mockReserveCredits,
  mockStreamText,
  dbSelectResults,
} = vi.hoisted(
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
    mockReserveCredits: vi.fn(),
    mockStreamText: vi.fn(),
    dbSelectResults: [] as unknown[][],
  }),
)

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
vi.mock('@/lib/billing/entitlements', () => ({
  resolveUploadEntitlements: mockResolveUploadEntitlements,
}))

vi.mock('@/lib/billing/credits', () => ({
  reserveCreditsForActiveBenefit: mockReserveCredits,
  refundActiveBenefitReservation: vi.fn(),
}))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mockStreamText,
}))
vi.mock('@/lib/ai/workspace-research', () => ({
  searchResearchDocuments: vi.fn().mockResolvedValue({ items: [] }),
}))
vi.mock('@/lib/ai/research-tools', () => ({ createResearchTools: () => ({}) }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn() }))
// select チェーンは where / from / orderBy をそのまま返し、limit で用意した結果を順に返す。
vi.mock('@cairn/db', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['from', 'where', 'orderBy']) chain[name] = () => chain
  chain['limit'] = () => Promise.resolve(dbSelectResults.shift() ?? [])
  return {
    db: { select: () => chain },
    aiConversations: { id: 'id', workspaceId: 'workspaceId', createdBy: 'createdBy' },
    aiMessages: {
      id: 'id',
      role: 'role',
      content: 'content',
      createdAt: 'createdAt',
      conversationId: 'conversationId',
    },
    workspaces: { id: 'id', aiChatModel: 'aiChatModel', aiChatSystemPrompt: 'aiChatSystemPrompt' },
  }
})

describe('POST /api/ai/conversations/[id]/messages', () => {
  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key'
    mockIsBillingEnabled.mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env['OPENAI_API_KEY']
    delete process.env['ANTHROPIC_API_KEY']
    dbSelectResults.length = 0
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

  const postQuestion = async () => {
    const { POST } = await import('./route')
    return POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '質問' }] }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )
  }

  // 会話の存在確認、履歴、ワークスペースのモデル設定の順に select される。
  const queueDbResults = (aiChatModel: string, aiChatSystemPrompt: string | null = null) => {
    dbSelectResults.push([{ id: 'conv-1' }], [], [{ aiChatModel, aiChatSystemPrompt }])
  }

  const streamedSystemPrompt = async (aiChatModel: string, aiChatSystemPrompt: string | null) => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults(aiChatModel, aiChatSystemPrompt)

    const response = await postQuestion()
    expect(response.status).toBe(200)
    // ストリームを読み切り、execute 内の streamText 呼び出しを待つ。
    await response.text()
    expect(mockStreamText).toHaveBeenCalledTimes(1)
    return (mockStreamText.mock.calls[0]![0] as { system: string }).system
  }

  it.each(['gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])(
    '%s を選択中でも、ワークスペースのシステムプロンプトをチャットの system に渡す',
    async (aiChatModel) => {
      const system = await streamedSystemPrompt(aiChatModel, '社内用語ではタスクを「チケット」と呼ぶ')

      expect(system).toContain('【ワークスペースの追加指示】')
      expect(system).toContain('社内用語ではタスクを「チケット」と呼ぶ')
    },
  )

  it('使用済みの依頼のメッセージ ID を指定すると、課金も回答もせず 409 を返す', async () => {
    const { POST } = await import('./route')
    const messageId = '44444444-4444-4444-8444-444444444444'
    mockIsBillingEnabled.mockReturnValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({ isActiveSupporter: true, creditBalance: 100 })
    // 会話の存在確認、履歴、モデル設定に続き、依頼の ID がすでにあることを返す
    queueDbResults('gpt-5')
    dbSelectResults.push([{ id: messageId }])

    const response = await POST(
      new Request('http://localhost/api/ai/conversations/conv/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '質問' }], messageId }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    )

    expect(response.status).toBe(409)
    expect(mockReserveCredits).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it('ワークスペースのシステムプロンプトが未設定なら、追加指示のブロックを入れない', async () => {
    const system = await streamedSystemPrompt('gpt-5', null)

    expect(system).not.toContain('【ワークスペースの追加指示】')
  })

  it('Claude を選択中で ANTHROPIC_API_KEY が未設定なら、OpenAI へ切り替えず 503 を返す', async () => {
    process.env['OPENAI_API_KEY'] = 'test-key'
    queueDbResults('claude-sonnet-5-5')

    const response = await postQuestion()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'ANTHROPIC_API_KEY が設定されていません',
    })
  })

  it('GPT-5 を選択中で OPENAI_API_KEY が未設定なら、Anthropic へ切り替えず 503 を返す', async () => {
    delete process.env['OPENAI_API_KEY']
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    queueDbResults('gpt-5')

    const response = await postQuestion()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'OPENAI_API_KEY が設定されていません',
    })
  })

  it('キー未設定の503ではクレジットを予約しない', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({
      isActiveSupporter: true,
      creditBalance: 1000,
    })
    queueDbResults('claude-opus-5-5')

    const response = await postQuestion()

    expect(response.status).toBe(503)
    expect(mockReserveCredits).not.toHaveBeenCalled()
  })

  it('ワークスペースのモデル設定が不正な値なら、既定モデルへ黙って切り替えず 500 を返す', async () => {
    queueDbResults('gpt-4o')

    const response = await postQuestion()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'ワークスペースの AI モデル設定を読み込めませんでした',
    })
  })

  it('ストリーム失敗後は途中のassistant応答を保存しない', async () => {
    const { shouldPersistFinishedAssistantMessage } = await import('./message-stream-lifecycle')

    expect(shouldPersistFinishedAssistantMessage(true)).toBe(false)
    expect(shouldPersistFinishedAssistantMessage(false)).toBe(true)
  })
})
