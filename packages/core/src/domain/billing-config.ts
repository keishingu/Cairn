// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const BILLING_CONFIG = {
  individualSubscriptionPriceJpy: 300,
  monthlyCreditGrant: 300,
  creditPackPriceJpy: 500,
  creditPackCredits: 400,
  activeAiRequestCredits: 10,
  // /ai の1依頼あたりの消費をモデルごとに決める（原価が約2倍の Opus は2倍）。キーは @cairn/shared の
  // AI_CHAT_MODELS と同じ集合（core は shared に依存しないため文字列で持ち、web のテストで一致を確かめる）。
  // スキルのテスト実行（dry-run）も、使うモデルのこの値を消費する
  aiChatRequestCreditsByModel: {
    'gpt-5': 10,
    'claude-sonnet-5-5': 10,
    'claude-opus-5-5': 20,
  },
  heartbeatAiDeliveryCredits: 10,
  freeStorageBytes: 10 * 1024 ** 3,
  storageRentCreditsPerGibMonth: 4,
  billingTimeZone: 'Asia/Tokyo',
} as const

export const BYTES_PER_GIB = 1024 ** 3
