// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AI チャットのモデル。値は各プロバイダーへ渡すモデル ID そのもの（日付サフィックスは付けない）。
// workspaces.ai_chat_model の CHECK 制約と同じ集合なので、追加・変更時は migration も更新する。
export const AI_CHAT_MODELS = ['gpt-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const
export type AiChatModel = (typeof AI_CHAT_MODELS)[number]

export const DEFAULT_AI_CHAT_MODEL: AiChatModel = 'gpt-5'

export type AiChatProvider = 'openai' | 'anthropic'

export function isAiChatModel(value: unknown): value is AiChatModel {
  return AI_CHAT_MODELS.includes(value as AiChatModel)
}

export function aiChatModelProvider(model: AiChatModel): AiChatProvider {
  return model.startsWith('claude-') ? 'anthropic' : 'openai'
}
