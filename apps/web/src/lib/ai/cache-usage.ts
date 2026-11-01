// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { LanguageModelUsage, ProviderMetadata } from 'ai'

export interface ChatStepUsage {
  usage: LanguageModelUsage
  providerMetadata: ProviderMetadata | undefined
}

export interface ChatCacheUsage {
  steps: number
  inputTokens: number
  outputTokens: number
  // Anthropic が返したときだけ数値。OpenAI など返さないプロバイダーは null（0 と区別して、未計測を効いていないと誤読させない）
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

function anthropicNumber(metadata: ProviderMetadata | undefined, key: string): number | null {
  const value = metadata?.['anthropic']?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function addNullable(total: number | null, value: number | null): number | null {
  if (value === null) return total
  return (total ?? 0) + value
}

// tool 呼び出しの各ステップで API を呼ぶので、プロンプトキャッシュが効いているかは全ステップの合計で見る。
// inputTokens は Anthropic ではキャッシュから読んだ・書いた分を含まない。
export function summarizeChatCacheUsage(steps: readonly ChatStepUsage[]): ChatCacheUsage {
  let cacheReadInputTokens: number | null = null
  let cacheCreationInputTokens: number | null = null
  let inputTokens = 0
  let outputTokens = 0
  for (const step of steps) {
    inputTokens += Number.isFinite(step.usage.promptTokens) ? step.usage.promptTokens : 0
    outputTokens += Number.isFinite(step.usage.completionTokens) ? step.usage.completionTokens : 0
    cacheReadInputTokens = addNullable(cacheReadInputTokens, anthropicNumber(step.providerMetadata, 'cacheReadInputTokens'))
    cacheCreationInputTokens = addNullable(
      cacheCreationInputTokens,
      anthropicNumber(step.providerMetadata, 'cacheCreationInputTokens'),
    )
  }
  return { steps: steps.length, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens }
}
