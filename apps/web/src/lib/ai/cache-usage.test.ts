// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { summarizeChatCacheUsage, summarizeStepUsage } from './cache-usage'

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

describe('summarizeStepUsage', () => {
  test('OpenAI の cachedPromptTokens をキャッシュ読みとして扱い、書き込みは null にする', () => {
    expect(
      summarizeStepUsage({ usage: usage(1000, 50), providerMetadata: { openai: { cachedPromptTokens: 800 } } }),
    ).toEqual({ inputTokens: 1000, outputTokens: 50, cacheReadInputTokens: 800, cacheCreationInputTokens: null })
  })

  test('OpenAI が cachedPromptTokens を返さない（null / 未定義）ときは 0 ではなく null にする', () => {
    expect(
      summarizeStepUsage({ usage: usage(10, 5), providerMetadata: { openai: { cachedPromptTokens: null } } })
        .cacheReadInputTokens,
    ).toBeNull()
    expect(summarizeStepUsage({ usage: usage(10, 5), providerMetadata: undefined })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: null,
      cacheCreationInputTokens: null,
    })
  })

  test('Anthropic のキャッシュ読み書きをそのまま返す', () => {
    expect(
      summarizeStepUsage({
        usage: usage(5, 7),
        providerMetadata: { anthropic: { cacheReadInputTokens: 0, cacheCreationInputTokens: 300 } },
      }),
    ).toMatchObject({ cacheReadInputTokens: 0, cacheCreationInputTokens: 300 })
  })
})

describe('summarizeChatCacheUsage（OpenAI）', () => {
  test('OpenAI のキャッシュ読みを全ステップで合計し、書き込みは null のままにする', () => {
    const summary = summarizeChatCacheUsage([
      { usage: usage(1000, 10), providerMetadata: { openai: { cachedPromptTokens: 0 } } },
      { usage: usage(1200, 20), providerMetadata: { openai: { cachedPromptTokens: 1000 } } },
    ])
    expect(summary.cacheReadInputTokens).toBe(1000)
    expect(summary.cacheCreationInputTokens).toBeNull()
  })
})
