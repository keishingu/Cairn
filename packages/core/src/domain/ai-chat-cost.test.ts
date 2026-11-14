// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { aiChatCostUsd, aiChatCreditsForCost } from './ai-chat-cost'

describe('aiChatCostUsd', () => {
  test('Anthropic は入力・出力・キャッシュの読み書きをそれぞれの単価で足す', () => {
    // Sonnet 5.5: 入力 $2・出力 $10・キャッシュ読み $0.1・書き $2.5（100万トークンあたり）
    const cost = aiChatCostUsd('claude-sonnet-5-5', {
      inputTokens: 1_000,
      outputTokens: 2_000,
      cacheReadInputTokens: 100_000,
      cacheCreationInputTokens: 20_000,
    })
    expect(cost).toBeCloseTo(0.002 + 0.02 + 0.01 + 0.05, 10)
  })

  test('OpenAI はキャッシュから読んだ分を通常の入力から除いて数える', () => {
    // GPT-5: 入力 $1.25・出力 $10・キャッシュ読み $0.125
    const cost = aiChatCostUsd('gpt-5', {
      inputTokens: 100_000,
      outputTokens: 1_000,
      cacheReadInputTokens: 80_000,
      cacheCreationInputTokens: null,
    })
    expect(cost).toBeCloseTo(20_000 * 1.25e-6 + 1_000 * 10e-6 + 80_000 * 0.125e-6, 10)
  })

  test('キャッシュを報告しなかったときは0として数える', () => {
    expect(
      aiChatCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 1_000, cacheReadInputTokens: null, cacheCreationInputTokens: null }),
    ).toBeCloseTo(0.02, 10)
  })

  test('単価が未設定のモデルは0にせずエラーにする', () => {
    expect(() =>
      aiChatCostUsd('claude-haiku-5-5', { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }),
    ).toThrow('単価が未設定')
  })
})

describe('aiChatCreditsForCost', () => {
  test('原価を円に直して1.5倍し、端数を切り上げる', () => {
    // $0.2 × ¥150 × 1.5 = 45
    expect(aiChatCreditsForCost(0.2)).toBe(45)
    // $0.001 × ¥150 × 1.5 = 0.225 → 1
    expect(aiChatCreditsForCost(0.001)).toBe(1)
  })

  test('浮動小数の誤差で整数ちょうどの値を1つ多く切り上げない', () => {
    expect(aiChatCreditsForCost(0.1 + 0.2 - 0.1)).toBe(45)
  })

  test('原価が0以下・不正な値なら消費しない', () => {
    expect(aiChatCreditsForCost(0)).toBe(0)
    expect(aiChatCreditsForCost(-1)).toBe(0)
    expect(aiChatCreditsForCost(Number.NaN)).toBe(0)
  })
})
