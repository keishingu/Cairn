// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { LanguageModelUsage, ProviderMetadata } from 'ai'

export interface ChatStepUsage {
  usage: LanguageModelUsage
  providerMetadata: ProviderMetadata | undefined
}

export interface StepUsageSummary {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

export interface ChatCacheUsage {
  steps: number
  inputTokens: number
  outputTokens: number
  // Anthropic（読み書き）/ OpenAI（読みのみ）が返したときだけ数値。返さないプロバイダー・書き込みを持たない OpenAI は null（0 と区別して、未計測を効いていないと誤読させない）
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

function providerNumber(metadata: ProviderMetadata | undefined, provider: string, key: string): number | null {
  const value = metadata?.[provider]?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function addNullable(total: number | null, value: number | null): number | null {
  if (value === null) return total
  return (total ?? 0) + value
}

// 1ステップ分の使用量をプロバイダー共通の形にそろえる。
// キャッシュ読み: Anthropic は cacheReadInputTokens、OpenAI は cachedPromptTokens。書き込みは Anthropic だけ。
export function summarizeStepUsage(step: ChatStepUsage): StepUsageSummary {
  return {
    inputTokens: Number.isFinite(step.usage.promptTokens) ? step.usage.promptTokens : 0,
    outputTokens: Number.isFinite(step.usage.completionTokens) ? step.usage.completionTokens : 0,
    cacheReadInputTokens:
      providerNumber(step.providerMetadata, 'anthropic', 'cacheReadInputTokens') ??
      providerNumber(step.providerMetadata, 'openai', 'cachedPromptTokens'),
    cacheCreationInputTokens: providerNumber(step.providerMetadata, 'anthropic', 'cacheCreationInputTokens'),
  }
}

// tool 呼び出しの各ステップで API を呼ぶので、プロンプトキャッシュが効いているかは全ステップの合計で見る。
// inputTokens は Anthropic ではキャッシュから読んだ・書いた分を含まない（OpenAI はキャッシュ済み分を含む）。
export function summarizeChatCacheUsage(steps: readonly ChatStepUsage[]): ChatCacheUsage {
  let cacheReadInputTokens: number | null = null
  let cacheCreationInputTokens: number | null = null
  let inputTokens = 0
  let outputTokens = 0
  for (const step of steps) {
    const summary = summarizeStepUsage(step)
    inputTokens += summary.inputTokens
    outputTokens += summary.outputTokens
    cacheReadInputTokens = addNullable(cacheReadInputTokens, summary.cacheReadInputTokens)
    cacheCreationInputTokens = addNullable(cacheCreationInputTokens, summary.cacheCreationInputTokens)
  }
  return { steps: steps.length, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }
}
