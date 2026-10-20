// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { anthropicCompatMiddleware } from './anthropic-compat-middleware'

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
