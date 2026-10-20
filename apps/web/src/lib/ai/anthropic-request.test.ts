// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { generateObject, streamText, tool } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { ClaudeRefusalError, withAnthropicCompat } from './anthropic-compat-middleware'

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
})
