// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  wrapLanguageModel,
  type LanguageModelV1,
  type LanguageModelV1Middleware,
  type LanguageModelV1StreamPart,
} from 'ai'

// Claude 5.5 系（Opus / Sonnet / Haiku）向けに、AI SDK v4 の既定動作とのずれを吸収する。
//
// 1. AI SDK v4 は temperature を未指定のとき 0 に補って送る。Claude 5.5 系は既定以外の
//    temperature / top_p / top_k を 400 で拒否するため、リクエスト直前に取り除く。
// 2. Claude 5.5 系は中身が空の thinking ブロックを返すことがあり、その場合は thinking_delta が来ず
//    signature_delta だけが届く。streamText は「reasoning なしの reasoning-signature」を
//    InvalidStreamPart として落とすため、署名の直前に空の reasoning を補ってストリームを成立させる。
//    補った空ブロックは次ステップ（ツール結果後）の送信時に、signature 付きの空 thinking として戻る。
export const anthropicCompatMiddleware: LanguageModelV1Middleware = {
  middlewareVersion: 'v1',
  transformParams: async ({ params }) => {
    const next = { ...params }
    delete next.temperature
    delete next.topP
    delete next.topK
    return next
  },
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream()
    let hasReasoningInBlock = false
    const patched = stream.pipeThrough(
      new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === 'reasoning') {
            hasReasoningInBlock = true
          } else if (chunk.type === 'reasoning-signature') {
            if (!hasReasoningInBlock) controller.enqueue({ type: 'reasoning', textDelta: '' })
            hasReasoningInBlock = false
          }
          controller.enqueue(chunk)
        },
      }),
    )
    return { stream: patched, ...rest }
  },
}

export function withAnthropicCompat(model: LanguageModelV1): LanguageModelV1 {
  return wrapLanguageModel({ model, middleware: anthropicCompatMiddleware })
}
