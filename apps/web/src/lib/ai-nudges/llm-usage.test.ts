// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { normalizePhaseTwoTokenUsage } from './llm-usage'

describe('normalizePhaseTwoTokenUsage', () => {
  it('OpenAI が返した入力・出力・合計トークンをそのまま表示用に変換する', () => {
    expect(normalizePhaseTwoTokenUsage({
      promptTokens: 120,
      completionTokens: 40,
      totalTokens: 160,
    })).toEqual({ inputTokens: 120, outputTokens: 40, totalTokens: 160 })
  })

  it('合計トークンがないプロバイダーでは入力と出力から合計を作る', () => {
    expect(normalizePhaseTwoTokenUsage({ promptTokens: 120, completionTokens: 40 })).toEqual({
      inputTokens: 120,
      outputTokens: 40,
      totalTokens: 160,
    })
  })

  it('不正なトークン値は0として扱う', () => {
    expect(normalizePhaseTwoTokenUsage({ promptTokens: -1, completionTokens: Number.NaN, totalTokens: 0 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    })
  })
})
