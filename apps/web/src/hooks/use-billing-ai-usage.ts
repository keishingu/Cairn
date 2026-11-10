// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useQuery } from '@tanstack/react-query'
import type { AiUsageDto } from '@/lib/billing/ai-usage'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

// 請求画面の「今月のAIの利用」（GET /api/billing/ai-usage）。
// エラーの message は翻訳キー（英語の UI 文）で、表示側が t() で訳す
export const BILLING_AI_USAGE_QUERY_KEY = ['billing-ai-usage'] as const

export function useBillingAiUsage() {
  return useQuery({
    queryKey: BILLING_AI_USAGE_QUERY_KEY,
    queryFn: async (): Promise<AiUsageDto> => {
      const response = await fetchWithAuth('/api/billing/ai-usage')
      if (!response.ok) throw new Error('Could not load AI usage')
      return response.json()
    },
  })
}
