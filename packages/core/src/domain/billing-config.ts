// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const BILLING_CONFIG = {
  individualSubscriptionPriceJpy: 300,
  monthlyCreditGrant: 300,
  creditPackPriceJpy: 500,
  creditPackCredits: 400,
  activeAiRequestCredits: 10,
  // /ai の1依頼で送信前に押さえる見積もりのクレジット（残高がこれ未満なら送れない）。実際の消費は回答の後に
  // 原価から精算する（aiChatCostUsd → aiChatCreditsForCost）。2026-11 の本番の実測の中央値（Sonnet 5.5 約¥22・
  // Opus 5.5 約¥30）に掛け率を掛けた値。キーは @cairn/shared の AI_CHAT_MODELS と同じ集合（core は shared に
  // 依存しないため文字列で持ち、web のテストで一致を確かめる）。スキルのテスト実行（dry-run）も同じく見積もりを押さえて原価で精算する
  aiChatRequestCreditsByModel: {
    'gpt-5': 30,
    'claude-sonnet-5-5': 30,
    'claude-opus-5-5': 45,
  },
  // /ai の原価（USD）をクレジットに換算する。1クレジット ≒ ¥1 の売上（Solo ¥300 / 300 クレジット）に対して、
  // 原価の1.5倍を消費する（粗利 約33%。決済手数料・為替の変動・記録していない原価の余裕を含む）
  aiCostCreditMultiplier: 1.5,
  aiCostUsdToJpy: 150,
  // /ai のモデルの単価（USD / 100万トークン。Batch ではない標準の価格）。プロバイダーの価格改定に合わせて更新する。
  // GPT-5 は OpenAI のモデルページ（developers.openai.com/docs/models/gpt-5）の値（2026-11 に確認）。
  // Anthropic の inputTokens はキャッシュの読み書きを含まず、cacheWrite は5分キャッシュ（入力の1.25倍）。
  // OpenAI の inputTokens はキャッシュから読んだ分を含み、キャッシュの書き込みに追加の料金は無い
  aiChatModelPricingUsdPerMTok: {
    'gpt-5': { provider: 'openai', input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    'claude-sonnet-5-5': { provider: 'anthropic', input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    'claude-opus-5-5': { provider: 'anthropic', input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  heartbeatAiDeliveryCredits: 10,
  freeStorageBytes: 100 * 1024 ** 3,
  storageRentCreditsPerGibMonth: 4,
  billingTimeZone: 'Asia/Tokyo',
} as const

export const BYTES_PER_GIB = 1024 ** 3
