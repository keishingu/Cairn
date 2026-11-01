// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// /ai の資料検索（RAG）で、新しいプロジェクト・ファイルをどれだけ優先するか。
// workspaces.ai_search_recency_weight の CHECK 制約と同じ集合なので、追加・変更時は migration も更新する。
export const AI_SEARCH_RECENCY_WEIGHTS = ['none', 'weak', 'medium', 'strong'] as const
export type AiSearchRecencyWeight = (typeof AI_SEARCH_RECENCY_WEIGHTS)[number]

// 既定は「なし」。新しさで並びが変わると既存ワークスペースの回答の傾向が変わるため、owner が選んだときだけ効かせる。
export const DEFAULT_AI_SEARCH_RECENCY_WEIGHT: AiSearchRecencyWeight = 'none'

// 点数が半分になるまでの日数（半減期）。none は新しさを使わない（意味の近さだけで並べる）。
export const AI_SEARCH_RECENCY_HALF_LIFE_DAYS: Record<AiSearchRecencyWeight, number | null> = {
  none: null,
  weak: 365 * 3,
  medium: 365,
  strong: 182,
}

export function isAiSearchRecencyWeight(value: unknown): value is AiSearchRecencyWeight {
  return AI_SEARCH_RECENCY_WEIGHTS.includes(value as AiSearchRecencyWeight)
}
