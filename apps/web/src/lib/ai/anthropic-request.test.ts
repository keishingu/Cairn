// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { generateObject, streamText, tool } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { ClaudeRefusalError, withAnthropicCompat } from './anthropic-compat-middleware'
import { createChatAnthropic } from './client'
import { summarizeChatCacheUsage } from './cache-usage'
import { createOpenAI } from '@ai-sdk/openai'
import { withConversationCache } from './conversation-cache-middleware'
import { toChatSystemMessages, withLatestMessageCacheBreakpoint } from '@/app/api/ai/conversations/[id]/messages/system-prompt'

// Claude 5.5 系は temperature / top_p / top_k / thinking / assistant prefill を既定以外で受け付けない。
// 実 API には接続せず、AI SDK が送るリクエスト本文と、空の thinking ブロックを含むレスポンスの処理を確認する。

type SseEvent = { event: string; data: Record<string, unknown> }

function sse(events: SseEvent[]): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const messageStart = (id: string): SseEvent => ({
  event: 'message_start',
  data: {
    type: 'message_start',
    message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 1 } },
  },
})

// thinking の本文が空で、signature_delta だけが届くブロック。
const emptyThinkingBlock = (index: number): SseEvent[] => [
  {
    event: 'content_block_start',
    data: { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } },
  },
  {
    event: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature: 'sig-abc' },
    },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index } },
]

const messageEnd = (stopReason: string): SseEvent[] => [
  {
    event: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 5 },
    },
  },
  { event: 'message_stop', data: { type: 'message_stop' } },
]

describe('Anthropic プロバイダーのリクエストとレスポンス処理', () => {
  it('空の thinking を含むツール呼び出しの複数ステップを、既定外のパラメータなしで完走できる', async () => {
    const requests: Record<string, unknown>[] = []
    const responses = [
      sse([
        messageStart('msg_1'),
        ...emptyThinkingBlock(0),
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 'toolu_1', name: 'lookup' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: '{"q":"cairn"}' },
          },
        },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
        ...messageEnd('tool_use'),
      ]),
      sse([
        messageStart('msg_2'),
        ...emptyThinkingBlock(0),
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: '結果です' },
          },
        },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
        ...messageEnd('end_turn'),
      ]),
    ]
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        const response = responses.shift()
        if (!response) throw new Error('想定外の追加リクエスト')
        return response
      }) as unknown as typeof fetch,
    })
    const model = withAnthropicCompat(anthropic('claude-sonnet-5-5'))

    const errors: unknown[] = []
    const result = streamText({
      model,
      messages: [{ role: 'user', content: '調べて' }],
      tools: {
        lookup: tool({
          description: '検索',
          parameters: z.object({ q: z.string() }),
          execute: async ({ q }) => ({ answer: `${q} の結果` }),
        }),
      },
      maxSteps: 3,
      onError: ({ error }) => {
        errors.push(error)
      },
    })

    await result.consumeStream()
    expect(await result.text).toBe('結果です')
    expect(errors).toEqual([])
    expect(requests).toHaveLength(2)

    for (const request of requests) {
      expect(request['model']).toBe('claude-sonnet-5-5')
      for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) {
        expect(request).not.toHaveProperty(key)
      }
      // 強制 tool_choice（any / tool）は送らない。
      expect(request['tool_choice']).toEqual({ type: 'auto' })
      const messages = request['messages'] as { role: string }[]
      expect(messages.at(-1)?.role).toBe('user')
    }

    // 2 ステップ目には、1 ステップ目の空の thinking ブロックが signature 付きでそのまま戻る。
    const secondMessages = requests[1]?.['messages'] as { role: string; content: unknown }[]
    const assistant = secondMessages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'thinking', thinking: '', signature: 'sig-abc' }),
        expect.objectContaining({ type: 'tool_use', id: 'toolu_1', name: 'lookup' }),
      ]),
    )
  })

  it('補完なしでは、AI SDK 既定の temperature 0 が送られ、空の thinking（署名のみ）で streamText が失敗する', async () => {
    const requests: Record<string, unknown>[] = []
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return sse([messageStart('msg_1'), ...emptyThinkingBlock(0), ...messageEnd('end_turn')])
      }) as unknown as typeof fetch,
    })
    const result = streamText({
      model: anthropic('claude-sonnet-5-5'),
      messages: [{ role: 'user', content: 'こんにちは' }],
    })

    await expect(
      (async () => {
        for await (const part of result.fullStream) void part
      })(),
    ).rejects.toThrow('reasoning-signature without reasoning')
    expect(requests[0]?.['temperature']).toBe(0)
  })

  it('generateObject は AI SDK 既定の temperature 0 を取り除き、強制ツール指定で構造化出力を得る', async () => {
    const requests: Record<string, unknown>[] = []
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-5-5',
            content: [
              { type: 'thinking', thinking: '', signature: 'sig-abc' },
              { type: 'tool_use', id: 'toolu_1', name: 'json', input: { title: 'やあ', body: '本文' } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch,
    })

    const generated = await generateObject({
      model: withAnthropicCompat(anthropic('claude-haiku-5-5')),
      schema: z.object({ title: z.string(), body: z.string() }),
      prompt: '通知文を書いて',
    })

    expect(generated.object).toEqual({ title: 'やあ', body: '本文' })
    expect(requests[0]).not.toHaveProperty('temperature')
    expect(requests[0]).not.toHaveProperty('thinking')
    expect(requests[0]?.['tool_choice']).toEqual({ type: 'tool', name: 'json' })
  })

  it('stop_reason が refusal のときは error パートを流して onError に拒否エラーを渡す', async () => {
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async () =>
        sse([
          messageStart('msg_refusal'),
          ...emptyThinkingBlock(0),
          ...messageEnd('refusal'),
        ])) as unknown as typeof fetch,
    })
    const errors: unknown[] = []
    const result = streamText({
      model: withAnthropicCompat(anthropic('claude-sonnet-5-5')),
      messages: [{ role: 'user', content: 'こんにちは' }],
      onError: ({ error }) => {
        errors.push(error)
      },
    })
    const parts: string[] = []
    for await (const part of result.fullStream) parts.push(part.type)

    expect(parts).toContain('error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(ClaudeRefusalError)
  })

  it('チャットの system は2ブロックで送り、変わらない側にだけ cache_control を付け、キャッシュの読み書きを集計できる', async () => {
    const requests: Record<string, unknown>[] = []
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return sse([
          {
            event: 'message_start',
            data: {
              type: 'message_start',
              message: {
                id: 'msg_cache',
                model: 'claude-sonnet-5-5',
                usage: { input_tokens: 30, output_tokens: 1, cache_read_input_tokens: 18000, cache_creation_input_tokens: 0 },
              },
            },
          },
          ...emptyThinkingBlock(0),
          ...messageEnd('end_turn'),
        ])
      }) as unknown as typeof fetch,
    })
    let finishedSteps: Parameters<typeof summarizeChatCacheUsage>[0] = []
    const result = streamText({
      model: withAnthropicCompat(anthropic('claude-sonnet-5-5')),
      messages: [
        ...toChatSystemMessages({ stable: '変わらない指示', dynamic: '現在日時: 2026年10月31日' }),
        { role: 'user', content: 'こんにちは' },
      ],
      onFinish: ({ steps }) => {
        finishedSteps = steps
      },
    })
    for await (const part of result.fullStream) void part

    expect(requests[0]?.['system']).toEqual([
      { type: 'text', text: '変わらない指示', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '現在日時: 2026年10月31日' },
    ])
    expect(summarizeChatCacheUsage(finishedSteps)).toMatchObject({
      steps: 1,
      cacheReadInputTokens: 18000,
      cacheCreationInputTokens: 0,
    })
  })
  it.each([
    ['claude-sonnet-5-5', { effort: 'medium' }],
    ['claude-opus-5-5', undefined],
  ] as const)('チャット用の Anthropic クライアントは %s に effort を付け（Sonnet のみ）、既定外のパラメータは送らない', async (modelId, expected) => {
    const requests: Record<string, unknown>[] = []
    const anthropic = createChatAnthropic((async (_url: unknown, init?: { body?: unknown }) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return sse([messageStart('msg_effort'), ...emptyThinkingBlock(0), ...messageEnd('end_turn')])
    }) as unknown as typeof fetch)
    const result = streamText({
      model: withAnthropicCompat(anthropic(modelId)),
      messages: [{ role: 'user', content: 'こんにちは' }],
    })
    for await (const part of result.fullStream) void part

    expect(requests[0]?.['model']).toBe(modelId)
    if (expected) expect(requests[0]?.['output_config']).toEqual(expected)
    else expect(requests[0]).not.toHaveProperty('output_config')
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) {
      expect(requests[0]).not.toHaveProperty(key)
    }
  })
})

const toolUseStep = (id: string, toolId: string): SseEvent[] => [
  messageStart(id),
  {
    event: 'content_block_start',
    data: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: toolId, name: 'lookup' } },
  },
  {
    event: 'content_block_delta',
    data: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"q":"cairn"}' } },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  ...messageEnd('tool_use'),
]

const finalTextStep: SseEvent[] = [
  messageStart('msg_final'),
  { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
  { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '完了' } } },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  ...messageEnd('end_turn'),
]

type RequestMessage = { role: string; content: string | { type: string; cache_control?: unknown }[] }

const countCacheControl = (request: Record<string, unknown>) =>
  (JSON.stringify(request).match(/"cache_control"/g) ?? []).length

const lastBlock = (message: RequestMessage | undefined) =>
  Array.isArray(message?.content) ? message.content.at(-1) : undefined

describe('会話キャッシュの境界', () => {
  it('履歴と各ステップの tool 結果の末尾にキャッシュ境界が移動しながら付き、全体で4つを超えない', async () => {
    const requests: Record<string, unknown>[] = []
    const responses = [
      sse(toolUseStep('msg_1', 'toolu_1')),
      sse(toolUseStep('msg_2', 'toolu_2')),
      sse(finalTextStep),
    ]
    const anthropic = createAnthropic({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        const response = responses.shift()
        if (!response) throw new Error('想定外の追加リクエスト')
        return response
      }) as unknown as typeof fetch,
    })
    const model = withConversationCache(withAnthropicCompat(anthropic('claude-sonnet-5-5')))

    const result = streamText({
      model,
      messages: [
        ...toChatSystemMessages({ stable: '変わらない指示', dynamic: '現在日時: 2026年10月31日' }),
        ...withLatestMessageCacheBreakpoint([
          { role: 'user', content: '前の質問' },
          { role: 'assistant', content: '前の回答' },
          { role: 'user', content: '調べて' },
        ]),
      ],
      tools: {
        lookup: tool({
          description: '検索',
          parameters: z.object({ q: z.string() }),
          execute: async ({ q }) => ({ answer: `${q} の結果` }),
        }),
      },
      maxSteps: 3,
    })
    await result.consumeStream()

    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(countCacheControl(request)).toBeLessThanOrEqual(4)
      const system = request['system'] as { cache_control?: unknown }[]
      expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' })
      expect(system[1]?.cache_control).toBeUndefined()
    }

    const toolResultBlocks = (request: Record<string, unknown>) =>
      (request['messages'] as RequestMessage[]).flatMap((m) =>
        Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result') : [],
      )

    // 1 ステップ目: 最新の利用者メッセージが固定の境界と移動する境界を兼ねるので、system と合わせて2つ。
    const first = requests[0]?.['messages'] as RequestMessage[]
    expect(lastBlock(first.at(-1))?.cache_control).toEqual({ type: 'ephemeral' })
    expect(countCacheControl(requests[0]!)).toBe(2)

    // 2・3 ステップ目: 最新の利用者メッセージの境界は残り、末尾の tool_result に移動する境界が付く。
    for (const [index, toolUseId] of [[1, 'toolu_1'], [2, 'toolu_2']] as const) {
      const messages = requests[index]?.['messages'] as RequestMessage[]
      expect(messages.at(-1)?.role).toBe('user')
      const lastResult = lastBlock(messages.at(-1))
      expect(lastResult).toMatchObject({ type: 'tool_result', tool_use_id: toolUseId })
      expect(lastResult?.cache_control).toEqual({ type: 'ephemeral' })
      expect(countCacheControl(requests[index]!)).toBe(3)
    }

    // 前のステップの tool_result からは境界が外れる（移動する）。
    const thirdResults = toolResultBlocks(requests[2]!)
    expect(thirdResults).toHaveLength(2)
    expect(thirdResults[0]?.cache_control).toBeUndefined()
    expect(thirdResults[1]?.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('OpenAI プロバイダーでは anthropic 用のキャッシュ指定がリクエスト本文に出ない', async () => {
    const bodies: string[] = []
    const openai = createOpenAI({
      apiKey: 'test-key',
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        bodies.push(String(init?.body))
        return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }) as unknown as typeof fetch,
    })
    const result = streamText({
      model: openai('gpt-5'),
      messages: [
        ...toChatSystemMessages({ stable: '変わらない指示', dynamic: '現在日時' }),
        ...withLatestMessageCacheBreakpoint([{ role: 'user', content: 'こんにちは' }]),
      ],
      onError: () => {},
    })
    await result.consumeStream()

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toContain('こんにちは')
    expect(bodies[0]).not.toMatch(/cache_?control/i)
  })
})
