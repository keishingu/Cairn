// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_REQUEST_BODY_BYTES } from './message-input'
import { buildChatUsageRow, type ChatUsageRecord } from '@/lib/ai/chat-usage'
import { chatRequestCredits } from '@/lib/ai/chat-model'

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

// /ai の利用ロールの判定。既定は全員が使えるワークスペースとして扱い、拒否のテストだけ差し替える
const { mockRequireAiChatAccess } = vi.hoisted(() => ({ mockRequireAiChatAccess: vi.fn() }))
vi.mock('@/lib/ai/chat-access', () => ({ requireAiChatAccess: mockRequireAiChatAccess }))
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
const { mockSearchResearchDocuments } = vi.hoisted(() => ({
  mockSearchResearchDocuments: vi.fn(),
}))
vi.mock('@/lib/ai/workspace-research', () => ({
  searchResearchDocuments: mockSearchResearchDocuments,
}))
vi.mock('@/lib/ai/research-tools', () => ({ createResearchTools: () => ({}) }))
// /ai の使用量の記録（応答後に非同期で書く）。評価する関数を受け取り、テストが応答の完了後に呼ぶ
const { mockRecordUsage } = vi.hoisted(() => ({ mockRecordUsage: vi.fn() }))
const { mockDbUpdate } = vi.hoisted(() => ({ mockDbUpdate: vi.fn() }))
vi.mock('@/lib/ai/chat-usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/chat-usage')>()),
  recordChatUsageAfterResponse: mockRecordUsage,
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}))
// select チェーンは where / from / orderBy をそのまま返し、limit で用意した結果を順に返す。
vi.mock('@cairn/db', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['from', 'where', 'orderBy']) chain[name] = () => chain
  chain['limit'] = () => Promise.resolve(dbSelectResults.shift() ?? [])
  return {
    db: {
      select: () => chain,
      transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ insert: () => ({ values: () => Promise.resolve() }) }),
      update: (...args: unknown[]) => mockDbUpdate(...args),
    },
    aiAttachments: { id: 'id', conversationId: 'conversationId', messageId: 'messageId' },
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

const ALL_MODELS = ['gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5']

// 会話の存在確認（会話のモデル）、履歴、ワークスペースのモデル設定の順に select される。
// 会話のモデルを省くと、会話とワークスペースの既定を同じモデルにする
const queueDbResults = (
  aiChatModel: string,
  aiChatSystemPrompt: string | null = null,
  options: { conversationModel?: string | null; allowedModels?: string[]; aiSearchRecencyWeight?: string } = {},
) => {
  const conversationModel = options.conversationModel === undefined ? aiChatModel : options.conversationModel
  dbSelectResults.push(
    [{ id: 'conv-1', model: conversationModel }],
    [],
    [{
      aiChatModel,
      aiChatAllowedModels: options.allowedModels ?? ALL_MODELS,
      aiChatSystemPrompt,
      aiSearchRecencyWeight: options.aiSearchRecencyWeight ?? 'none',
    }],
  )
}

describe('POST /api/ai/conversations/[id]/messages', () => {
  beforeEach(() => {
    process.env['OPENAI_API_KEY'] = 'test-key'
    mockDbUpdate.mockImplementation(() => ({ set: () => ({ where: () => Promise.resolve() }) }))
    mockIsBillingEnabled.mockReturnValue(false)
    mockRequireAiChatAccess.mockResolvedValue(null)
    mockSearchResearchDocuments.mockResolvedValue({ items: [] })
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
    queueDbResults('gpt-5')
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
    queueDbResults('gpt-5')
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



  const streamedSystemPrompt = async (aiChatModel: string, aiChatSystemPrompt: string | null) => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults(aiChatModel, aiChatSystemPrompt)

    const response = await postQuestion()
    expect(response.status).toBe(200)
    // ストリームを読み切り、execute 内の streamText 呼び出しを待つ。
    await response.text()
    expect(mockStreamText).toHaveBeenCalledTimes(1)
    const { messages } = mockStreamText.mock.calls[0]![0] as { messages: { role: string; content: unknown }[] }
    return messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content as string)
      .join('\n')
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

  it('system は先頭の2つの system メッセージで渡し、変わらない側にだけキャッシュの区切りを置く', async () => {
    await streamedSystemPrompt('claude-sonnet-5-5', null)

    const { system, messages } = mockStreamText.mock.calls[0]![0] as {
      system?: string
      messages: { role: string; providerOptions?: unknown }[]
    }
    expect(system).toBeUndefined()
    expect(messages.slice(0, 2).map((message) => message.role)).toEqual(['system', 'system'])
    expect(messages[0]!.providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } })
    expect(messages[1]!.providerOptions).toBeUndefined()
    expect(messages.slice(2).every((message) => message.role !== 'system')).toBe(true)
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

  it('会話で選んだモデルで回答し、ワークスペースの既定モデルには切り替えない', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults('gpt-5', null, { conversationModel: 'claude-sonnet-5-5' })

    const response = await postQuestion()
    await response.text()

    expect(response.status).toBe(200)
    const { model } = mockStreamText.mock.calls[0]![0] as { model: { modelId: string } }
    expect(model.modelId).toBe('claude-sonnet-5-5')
  })

  it('モデルを持たない旧い会話は、ワークスペースの既定モデルで回答する', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults('claude-opus-5-5', null, { conversationModel: null })

    const response = await postQuestion()
    await response.text()

    const { model } = mockStreamText.mock.calls[0]![0] as { model: { modelId: string } }
    expect(model.modelId).toBe('claude-opus-5-5')
  })

  it('owner が選べるモデルから外したモデルの会話は、課金も回答もせず 409 で選び直しを求める', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    queueDbResults('gpt-5', null, { conversationModel: 'claude-opus-5-5', allowedModels: ['gpt-5'] })

    const response = await postQuestion()

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'この会話のモデルはワークスペースで使えなくなりました。入力欄のモデルを選び直してください。',
    })
    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
    expect(mockReserveCredits).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it('Opus の会話は、モデルごとのクレジット（20）で残高を確かめて予約する', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    process.env['ANTHROPIC_API_KEY'] = 'test-key'
    mockResolveUploadEntitlements.mockResolvedValue({ isActiveSupporter: true, creditBalance: 15 })
    queueDbResults('gpt-5', null, { conversationModel: 'claude-opus-5-5' })

    const short = await postQuestion()
    expect(short.status).toBe(402)
    expect(mockReserveCredits).not.toHaveBeenCalled()

    mockResolveUploadEntitlements.mockResolvedValue({ isActiveSupporter: true, creditBalance: 25 })
    mockReserveCredits.mockResolvedValue(true)
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults('gpt-5', null, { conversationModel: 'claude-opus-5-5' })

    const enough = await postQuestion()
    await enough.text()

    expect(enough.status).toBe(200)
    expect(mockReserveCredits).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000010', 20, expect.any(String))
  })
  it('/ai を使えないロールの依頼は、課金も回答もせず 403 を返す', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    const { NextResponse } = await import('next/server')
    mockRequireAiChatAccess.mockResolvedValue(
      NextResponse.json({ error: 'このワークスペースでは、AIアシスタントはオーナーだけが利用できます。' }, { status: 403 }),
    )

    const response = await postQuestion()

    expect(response.status).toBe(403)
    expect(mockResolveUploadEntitlements).not.toHaveBeenCalled()
    expect(mockReserveCredits).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })
  it('資料検索の新しさの重みは課金前に読み、RAG に渡す', async () => {
    mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
    queueDbResults('gpt-5', null, { aiSearchRecencyWeight: 'medium' })

    const response = await postQuestion()
    await response.text()

    expect(response.status).toBe(200)
    expect(mockSearchResearchDocuments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recencyWeight: 'medium' }),
    )
  })

  it('資料検索の新しさの重みが不正なら、RAG なしで続けず課金前に 500 を返す', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockResolveUploadEntitlements.mockResolvedValue({ isActiveSupporter: true, creditBalance: 100 })
    queueDbResults('gpt-5', null, { aiSearchRecencyWeight: 'max' })

    const response = await postQuestion()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'ワークスペースの資料検索の設定を読み込めませんでした' })
    expect(mockReserveCredits).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })
  describe('使用量の記録（ai_chat_usage）', () => {
    const usage = (promptTokens: number, completionTokens: number) => ({
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    })
    const stepWithTools = (promptTokens: number, completionTokens: number, toolNames: string[]) => ({
      usage: usage(promptTokens, completionTokens),
      providerMetadata: undefined,
      finishReason: toolNames.length > 0 ? 'tool-calls' : 'stop',
      toolCalls: toolNames.map((toolName) => ({ toolName })),
      toolResults: [],
    })

    type StreamOptions = {
      onStepFinish: (step: unknown) => void
      onError: () => Promise<void>
      onFinish: (event: { text: string; steps: unknown[] }) => Promise<void>
    }

    // ストリームを読み切り、streamText に渡されたコールバックを返す
    const startStream = async () => {
      mockStreamText.mockReturnValue({ mergeIntoDataStream: vi.fn() })
      queueDbResults('gpt-5')
      const response = await postQuestion()
      await response.text()
      return mockStreamText.mock.calls[0]![0] as StreamOptions
    }
    const recordedRecord = (callIndex = 0): ChatUsageRecord =>
      (mockRecordUsage.mock.calls[callIndex]![0] as () => ChatUsageRecord)()

    it('onFinish で全ステップの使用量を1回だけ記録する', async () => {
      const options = await startStream()
      const steps = [stepWithTools(100, 10, ['searchDocuments', 'getTask']), stepWithTools(200, 30, [])]

      await options.onFinish({ text: '回答', steps })

      expect(mockRecordUsage).toHaveBeenCalledTimes(1)
      const record = recordedRecord()
      expect(record).toMatchObject({
        status: 'success',
        error: null,
        model: 'gpt-5',
        requestCredits: null,
        conversationId: 'conv-1',
        userId: '00000000-0000-0000-0000-000000000001',
        workspaceId: '00000000-0000-0000-0000-000000000010',
        skillRunId: null,
      })
      expect(typeof record.assistantMessageId).toBe('string')
      expect(record.steps).toHaveLength(2)
      expect(record.durationMs).toBeGreaterThanOrEqual(0)
      const row = buildChatUsageRow(record)
      expect(row.toolNames).toEqual(['searchDocuments', 'getTask'])
      expect(row.steps).toBe(2)
      expect(row.inputTokens).toBe(300)
    })

    it('会話タイトルの更新だけが失敗しても、保存・課金済みなので成功として記録する', async () => {
      const options = await startStream()
      mockDbUpdate.mockImplementation(() => {
        throw new Error('title update failed')
      })

      await options.onFinish({ text: '回答', steps: [stepWithTools(100, 10, [])] })

      expect(mockRecordUsage).toHaveBeenCalledTimes(1)
      expect(recordedRecord()).toMatchObject({ status: 'success', error: null })
    })

    it('ステップの途中でストリームが失敗したら、完了済みのステップ付きで failed を記録する', async () => {
      const options = await startStream()
      options.onStepFinish(stepWithTools(100, 10, ['searchDocuments']))

      await options.onError()

      expect(mockRecordUsage).toHaveBeenCalledTimes(1)
      const record = recordedRecord()
      expect(record).toMatchObject({ status: 'failed', error: 'stream_failed' })
      expect(record.steps).toHaveLength(1)
    })

    it('onError の後に onFinish が来ても記録は1回で、onFinish のステップを使う', async () => {
      const options = await startStream()
      options.onStepFinish(stepWithTools(100, 10, ['searchDocuments']))

      await options.onError()
      await options.onFinish({ text: '', steps: [stepWithTools(100, 10, ['searchDocuments']), stepWithTools(50, 5, [])] })

      expect(mockRecordUsage).toHaveBeenCalledTimes(1)
      const record = recordedRecord()
      expect(record.status).toBe('failed')
      expect(record.steps).toHaveLength(2)
    })

    it('クレジットの予約に失敗した 402 でも、credit_reservation_failed の行をステップなしで記録する', async () => {
      mockIsBillingEnabled.mockReturnValue(true)
      mockResolveUploadEntitlements.mockResolvedValue({ isActiveSupporter: true, creditBalance: 1000 })
      mockReserveCredits.mockResolvedValue(false)
      queueDbResults('claude-opus-5-5')
      process.env['ANTHROPIC_API_KEY'] = 'test-key'

      const response = await postQuestion()

      expect(response.status).toBe(402)
      expect(mockRecordUsage).toHaveBeenCalledTimes(1)
      const record = recordedRecord()
      expect(record).toMatchObject({
        status: 'failed',
        error: 'credit_reservation_failed',
        model: 'claude-opus-5-5',
        requestCredits: chatRequestCredits('claude-opus-5-5'),
        steps: [],
      })
    })
  })
})
