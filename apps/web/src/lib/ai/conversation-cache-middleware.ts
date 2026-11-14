// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  wrapLanguageModel,
  type LanguageModelV1,
  type LanguageModelV1Middleware,
  type LanguageModelV1Prompt,
} from 'ai'

// 各ステップのリクエスト末尾（利用者メッセージまたは tool 結果）に Anthropic のキャッシュ境界を動かしながら置く。
// AI SDK v4 の streamText には prepareStep が無く、2ステップ目以降に自動で足される assistant の tool 呼び出しと
// tool 結果には providerOptions を付けられない。そのため全ステップで履歴と過去の tool 結果を全額課金で
// 再送してしまう。リクエスト直前のここで末尾に境界を置けば、次ステップは前ステップが書いた接頭辞を読める。
// 境界数は Anthropic の上限4つに対し、stable system + 最新の利用者メッセージ + これの3つに収める。
export const conversationCacheMiddleware: LanguageModelV1Middleware = {
  middlewareVersion: 'v1',
  transformParams: async ({ params }) => {
    const last = params.prompt.at(-1)
    if (!last || (last.role !== 'user' && last.role !== 'tool')) return params

    const marked = {
      ...last,
      providerMetadata: {
        ...last.providerMetadata,
        anthropic: { ...last.providerMetadata?.['anthropic'], cacheControl: { type: 'ephemeral' } },
      },
    } as LanguageModelV1Prompt[number]
    return { ...params, prompt: [...params.prompt.slice(0, -1), marked] }
  },
}

export function withConversationCache(model: LanguageModelV1): LanguageModelV1 {
  return wrapLanguageModel({ model, middleware: conversationCacheMiddleware })
}
