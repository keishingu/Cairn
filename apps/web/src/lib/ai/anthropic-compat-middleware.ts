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
// 3. @ai-sdk/anthropic v1 は maxTokens 未指定時に 4096 を送る。Claude 5.5 系は thinking と本文が
//    max_tokens を共有するため、4096 では複数ツールの調査中に思考だけで上限に達し、ツール呼び出しや
//    回答が空のまま課金される。呼び出し側が指定しないときは余裕のある上限を補う。
export const ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS = 16000

// 4. Claude 5.5 系は安全上の理由で回答を控えると HTTP 200 + stop_reason "refusal" を返す。
//    @ai-sdk/anthropic v1 はこれを finishReason "unknown" に丸めるため（本実装はサーバーツールを
//    使わないので pause_turn は来ない）、そのままだと空や途中の回答が成功として保存・課金される。
//    error パートを流して streamText の onError（クレジット返却・保存抑止）と利用者へのエラー表示に乗せる。
export class ClaudeRefusalError extends Error {
  constructor() {
    super('Claude がこの依頼への回答を控えました。表現を変えるか、チャットのモデルを切り替えてお試しください。')
    this.name = 'ClaudeRefusalError'
  }
}

export const anthropicCompatMiddleware: LanguageModelV1Middleware = {
  middlewareVersion: 'v1',
  transformParams: async ({ params }) => {
    const next = { ...params }
    delete next.temperature
    delete next.topP
    delete next.topK
    next.maxTokens ??= ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS
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
          } else if (chunk.type === 'finish' && chunk.finishReason === 'unknown') {
            controller.enqueue({ type: 'error', error: new ClaudeRefusalError() })
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
