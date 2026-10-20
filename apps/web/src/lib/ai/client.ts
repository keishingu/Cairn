// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { aiChatModelProvider, type AiChatModel, type AiChatProvider } from '@cairn/shared'
import type { LanguageModelV1 } from 'ai'
import { withAnthropicCompat } from './anthropic-compat-middleware'

export const openai = createOpenAI({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
})

export const anthropic = createAnthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
})

export const EMBEDDING_MODEL = 'text-embedding-3-small'

// AI PMO Phase 2 の通知文生成に使う固定モデル（ワークスペース設定では選ばせない）。
export const NUDGE_COPY_MODEL = 'claude-haiku-5-5'

const API_KEY_ENV: Record<AiChatProvider, 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}

// 選択中モデルのプロバイダーに必要な API キーの環境変数名。別プロバイダーへ黙って切り替えないため、
// 呼び出し側は未設定ならこの名前を含むエラーを返す。
export function apiKeyEnvForChatModel(model: AiChatModel): 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' {
  return API_KEY_ENV[aiChatModelProvider(model)]
}

export function chatLanguageModel(model: AiChatModel): LanguageModelV1 {
  if (aiChatModelProvider(model) === 'openai') return openai(model)
  return withAnthropicCompat(anthropic(model))
}

// 通知文生成は Anthropic のみを使う。未設定のまま呼ぶと空のキーで 401 になり原因が分かりにくいため、
// 呼び出し前に設定名を含むエラーで止める。
export function nudgeCopyLanguageModel(): LanguageModelV1 {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません')
  }
  return withAnthropicCompat(anthropic(NUDGE_COPY_MODEL))
}
