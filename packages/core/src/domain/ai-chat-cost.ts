// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BILLING_CONFIG } from './billing-config'

export type AiChatPricedModel = keyof typeof BILLING_CONFIG.aiChatModelPricingUsdPerMTok

export interface AiChatTokenUsage {
  inputTokens: number
  outputTokens: number
  // null はプロバイダーが報告しなかったこと（0 として扱う）
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

export function isAiChatPricedModel(model: string): model is AiChatPricedModel {
  return Object.hasOwn(BILLING_CONFIG.aiChatModelPricingUsdPerMTok, model)
}

/**
 * /ai の1依頼（全ステップの合計）の原価（USD）。単価が無いモデルは原価を出せないのでエラーにする
 * （0 として扱うと無料で使えてしまう）。
 */
export function aiChatCostUsd(model: string, usage: AiChatTokenUsage): number {
  if (!isAiChatPricedModel(model)) throw new Error(`単価が未設定のモデルです: ${model}`)
  const price = BILLING_CONFIG.aiChatModelPricingUsdPerMTok[model]
  const cacheRead = Math.max(0, usage.cacheReadInputTokens ?? 0)
  const cacheWrite = Math.max(0, usage.cacheCreationInputTokens ?? 0)
  // OpenAI の入力はキャッシュから読んだ分を含むので、その分を通常の入力から除く
  const uncachedInput = Math.max(0, price.provider === 'openai' ? usage.inputTokens - cacheRead : usage.inputTokens)
  const output = Math.max(0, usage.outputTokens)
  return (
    (uncachedInput * price.input + output * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) /
    1_000_000
  )
}

/** 原価（USD）を消費するクレジットに換算する。端数は切り上げ、原価が0なら0 */
export function aiChatCreditsForCost(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0
  // 浮動小数の誤差で整数ちょうどの値が1つ上に切り上がらないよう、小さく丸めてから切り上げる
  const credits = costUsd * BILLING_CONFIG.aiCostUsdToJpy * BILLING_CONFIG.aiCostCreditMultiplier
  return Math.ceil(Math.round(credits * 1e6) / 1e6)
}
