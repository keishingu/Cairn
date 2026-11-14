// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type { LanguageModelV1CallOptions, LanguageModelV1Prompt } from 'ai'
import { conversationCacheMiddleware } from './conversation-cache-middleware'

const EPHEMERAL = { type: 'ephemeral' }

async function transform(prompt: LanguageModelV1Prompt): Promise<LanguageModelV1CallOptions> {
  const params = { inputFormat: 'messages', mode: { type: 'regular' }, prompt } as LanguageModelV1CallOptions
  return conversationCacheMiddleware.transformParams!({
    type: 'stream',
    params,
  })
}

describe('会話キャッシュ用ミドルウェア', () => {
  it('末尾が user メッセージならキャッシュ境界を付ける', async () => {
    const result = await transform([
      { role: 'system', content: 's' },
      { role: 'user', content: [{ type: 'text', text: 'こんにちは' }] },
    ])
    expect(result.prompt.at(-1)?.providerMetadata).toEqual({ anthropic: { cacheControl: EPHEMERAL } })
    expect(result.prompt[0]?.providerMetadata).toBeUndefined()
  })

  it('末尾が tool メッセージならキャッシュ境界を付ける', async () => {
    const result = await transform([
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'x', args: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'x', result: 1 }] },
    ])
    expect(result.prompt.at(-1)?.providerMetadata).toEqual({ anthropic: { cacheControl: EPHEMERAL } })
    expect(result.prompt[1]?.providerMetadata).toBeUndefined()
  })

  it('既存の providerMetadata の他のキーを保つ', async () => {
    const result = await transform([
      {
        role: 'user',
        content: [{ type: 'text', text: 'q' }],
        providerMetadata: { anthropic: { foo: 1 }, other: { bar: 2 } },
      },
    ])
    expect(result.prompt.at(-1)?.providerMetadata).toEqual({
      anthropic: { foo: 1, cacheControl: EPHEMERAL },
      other: { bar: 2 },
    })
  })

  it('入力の prompt とメッセージを書き換えない', async () => {
    const last: LanguageModelV1Prompt[number] = { role: 'user', content: [{ type: 'text', text: 'q' }] }
    const prompt: LanguageModelV1Prompt = [last]
    const result = await transform(prompt)
    expect(result.prompt).not.toBe(prompt)
    expect(result.prompt[0]).not.toBe(last)
    expect(last).not.toHaveProperty('providerMetadata')
    expect(prompt).toHaveLength(1)
  })

  it('末尾が assistant / system のとき、または prompt が空のときは何もしない', async () => {
    const assistant: LanguageModelV1Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
    ]
    expect((await transform(assistant)).prompt).toBe(assistant)
    const system: LanguageModelV1Prompt = [{ role: 'system', content: 's' }]
    expect((await transform(system)).prompt).toBe(system)
    const empty: LanguageModelV1Prompt = []
    expect((await transform(empty)).prompt).toBe(empty)
  })
})
