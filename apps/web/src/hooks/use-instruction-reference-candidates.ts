// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// オートメーションの指示文の入力補完の候補（メンバー・属性・プロジェクトの役割・チャンネル）
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfileAttributes } from '@/hooks/use-profile-attributes'
import { useProjectRoles } from '@/hooks/use-project-roles'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

async function fetchItems<T>(url: string): Promise<T[]> {
  const response = await fetchWithAuth(url)
  if (!response.ok) throw new Error('候補を取得できませんでした')
  const body = (await response.json()) as { items?: T[] }
  return body.items ?? []
}

// メンバー・チャンネルはサーバー側で絞り込んでから上限をかける（先頭の200件だけから探すと、大きなワークスペースで選べない人が出る）
export function useReferenceCandidates(trigger: { symbol: '@' | '#'; query: string } | null) {
  const query = React.useDeferredValue(trigger?.query.trim() ?? '')
  const members = useQuery({
    queryKey: ['instruction-reference-members', query],
    queryFn: () => fetchItems<{ userId: string; name: string }>(`/api/research/members?limit=20&query=${encodeURIComponent(query)}`),
    enabled: trigger?.symbol === '@',
  })
  const channels = useQuery({
    queryKey: ['instruction-reference-channels', query],
    queryFn: () => fetchItems<{ id: string; name: string }>(`/api/research/channels?limit=20&query=${encodeURIComponent(query)}`),
    enabled: trigger?.symbol === '#',
  })
  const attributes = useProfileAttributes(trigger?.symbol === '@')
  const roles = useProjectRoles()
  // どれか1つでも取れなければ、欠けた候補を「一致なし」に見せずにエラーを出す
  const error = trigger?.symbol === '#'
    ? channels.error
    : members.error ?? attributes.error ?? (roles.error as Error | null)
  return {
    members: members.data ?? [],
    channels: channels.data ?? [],
    attributes: attributes.data ?? [],
    roles: roles.data ?? [],
    isLoading: trigger?.symbol === '#' ? channels.isLoading : members.isLoading || attributes.isLoading || roles.isLoading,
    error,
  }
}

