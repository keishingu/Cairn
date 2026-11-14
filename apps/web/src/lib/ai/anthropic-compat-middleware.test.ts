// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import {
  ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
  TRUNCATED_ANSWER_NOTICE,
  anthropicCompatMiddleware,
} from './anthropic-compat-middleware'

async function collect(parts: LanguageModelV1StreamPart[]): Promise<LanguageModelV1StreamPart[]> {
  const doStream = async () => ({
    stream: new ReadableStream<LanguageModelV1StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  })
  const wrap = anthropicCompatMiddleware.wrapStream
  if (!wrap) throw new Error('wrapStream が未定義です')
  const result = await wrap({
    doGenerate: async () => {
      throw new Error('使用しない')
    },
    doStream,
    params: {} as never,
    model: {} as LanguageModelV1,
  })
  const out: LanguageModelV1StreamPart[] = []
  const reader = result.stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return out
}

describe('anthropicCompatMiddleware の空 thinking 補完', () => {
  it('thinking の本文なしで署名だけが来たとき、署名の直前に空の reasoning を補う', async () => {
    const out = await collect([
      { type: 'reasoning-signature', signature: 'sig' },
      { type: 'text-delta', textDelta: 'こんにちは' },
    ])

    expect(out).toEqual([
      { type: 'reasoning', textDelta: '' },
      { type: 'reasoning-signature', signature: 'sig' },
      { type: 'text-delta', textDelta: 'こんにちは' },
    ])
  })

  it('本文つきの thinking はそのまま通す', async () => {
    const parts: LanguageModelV1StreamPart[] = [
      { type: 'reasoning', textDelta: '考え中' },
      { type: 'reasoning-signature', signature: 'sig' },
    ]

    expect(await collect(parts)).toEqual(parts)
  })

  it('ブロックごとに判定し、2つ目が空の thinking なら2つ目にだけ補う', async () => {
    const out = await collect([
      { type: 'reasoning', textDelta: 'a' },
      { type: 'reasoning-signature', signature: 's1' },
      { type: 'reasoning-signature', signature: 's2' },
    ])

    expect(out).toEqual([
      { type: 'reasoning', textDelta: 'a' },
      { type: 'reasoning-signature', signature: 's1' },
      { type: 'reasoning', textDelta: '' },
      { type: 'reasoning-signature', signature: 's2' },
    ])
  })
})

describe('anthropicCompatMiddleware の出力上限', () => {
  const transform = async (params: Record<string, unknown>) => {
    const fn = anthropicCompatMiddleware.transformParams
    if (!fn) throw new Error('transformParams が未定義です')
    return fn({ type: 'stream', params: params as never })
  }

  it('maxTokens 未指定のときは provider 既定の 4096 ではなく Claude 用の上限を補う', async () => {
    const next = await transform({ prompt: [], inputFormat: 'messages', mode: { type: 'regular' } })
    expect(next.maxTokens).toBe(ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS)
  })

  it('呼び出し側が maxTokens を指定したときはその値を保つ', async () => {
    const next = await transform({ prompt: [], inputFormat: 'messages', mode: { type: 'regular' }, maxTokens: 500 })
    expect(next.maxTokens).toBe(500)
  })

  it('長い比較・まとめの回答が切れないよう、補う上限は 32000 にする', () => {
    expect(ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS).toBe(32000)
  })
})

describe('anthropicCompatMiddleware の途中で切れた回答', () => {
  const finish = (finishReason: 'length' | 'stop') =>
    ({ type: 'finish', finishReason, usage: { promptTokens: 1, completionTokens: 1 } }) as LanguageModelV1StreamPart

  it('上限に達して終わったときは、finish の直前に途中で切れたことを伝える注記を流す', async () => {
    const out = await collect([{ type: 'text-delta', textDelta: '途中までの回答' }, finish('length')])

    expect(out).toEqual([
      { type: 'text-delta', textDelta: '途中までの回答' },
      { type: 'text-delta', textDelta: TRUNCATED_ANSWER_NOTICE },
      finish('length'),
    ])
    expect(TRUNCATED_ANSWER_NOTICE).toContain('途中で切れています')
  })

  it('通常の終了では注記を足さない', async () => {
    const out = await collect([{ type: 'text-delta', textDelta: '回答' }, finish('stop')])

    expect(out).toEqual([{ type: 'text-delta', textDelta: '回答' }, finish('stop')])
  })
})
