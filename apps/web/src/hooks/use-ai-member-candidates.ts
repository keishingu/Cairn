// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの入力欄で `@` を打ったときのメンバーの候補（AI の調査 tool と同じ権限・範囲で引く）

import { useQuery } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

export interface AiMemberCandidate {
  userId: string
  name: string
}

async function fetchMembers(query: string): Promise<AiMemberCandidate[]> {
  const response = await fetchWithAuth(`/api/research/members?limit=8&query=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error(`Could not load suggestions (${response.status})`)
  const body = (await response.json()) as { items?: AiMemberCandidate[] }
  return body.items ?? []
}

/** query は入力中の `@` の後ろの文字。enabled が false の間（候補を開いていない間）は取得しない */
export function useAiMemberCandidates(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-member-mention-candidates', query],
    queryFn: () => fetchMembers(query),
    enabled,
  })
}
