// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const BILLING_CONFIG = {
  individualSubscriptionPriceJpy: 300,
  monthlyCreditGrant: 300,
  creditPackPriceJpy: 500,
  creditPackCredits: 400,
  activeAiRequestCredits: 10,
  heartbeatAiDeliveryCredits: 10,
  freeStorageBytes: 10 * 1024 ** 3,
  storageRentCreditsPerGibMonth: 4,
  billingTimeZone: 'Asia/Tokyo',
} as const

export const BYTES_PER_GIB = 1024 ** 3
