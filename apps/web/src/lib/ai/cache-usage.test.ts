// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { summarizeChatCacheUsage } from './cache-usage'

const usage = (promptTokens: number, completionTokens: number) => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
})

describe('summarizeChatCacheUsage', () => {
  test('全ステップの入力・出力とキャッシュの読み書きを合計する', () => {
    const summary = summarizeChatCacheUsage([
      {
        usage: usage(120, 40),
        providerMetadata: { anthropic: { cacheCreationInputTokens: 18000, cacheReadInputTokens: 0 } },
      },
      {
        usage: usage(300, 80),
        providerMetadata: { anthropic: { cacheCreationInputTokens: 0, cacheReadInputTokens: 18000 } },
      },
    ])

    expect(summary).toEqual({
      steps: 2,
      inputTokens: 420,
      outputTokens: 120,
      cacheReadInputTokens: 18000,
      cacheCreationInputTokens: 18000,
    })
  })

  test('キャッシュの値を返さないプロバイダーは 0 ではなく null にする', () => {
    const summary = summarizeChatCacheUsage([{ usage: usage(500, 20), providerMetadata: { openai: {} } }])

    expect(summary.cacheReadInputTokens).toBeNull()
    expect(summary.cacheCreationInputTokens).toBeNull()
    expect(summary.inputTokens).toBe(500)
  })
})
