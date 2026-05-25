// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { tool } from 'ai'
import { z } from 'zod'

interface TavilyResult {
  title: string
  url: string
  content: string
  score?: number
}

interface TavilyResponse {
  results?: TavilyResult[]
  error?: string
}

export const webSearchTool = tool({
  description:
    'ウェブ検索を行い、最新のインターネット上の情報を取得します。トレーニングデータに含まれていない最新情報や専門的な情報が必要な場合に使用してください。',
  parameters: z.object({
    query: z.string().describe('検索クエリ（日本語・英語どちらでも可）'),
  }),
  execute: async ({ query }) => {
    const apiKey = process.env['TAVILY_API_KEY']
    if (!apiKey) {
      return { error: 'TAVILY_API_KEY が設定されていません' }
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        search_depth: 'basic',
        include_answer: true,
      }),
    })

    if (!response.ok) {
      return { error: `検索に失敗しました: ${response.status}` }
    }

    const data = (await response.json()) as TavilyResponse

    return {
      results: (data.results ?? []).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    }
  },
})
