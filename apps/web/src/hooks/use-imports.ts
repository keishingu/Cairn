// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

/** 取り込み画面が使うデータ（docs/import-design.md）。取得に失敗したら例外にし、空の一覧に置き換えない */

export interface ImportedIdentityDto {
  id: string
  key: string
  displayName: string | null
  isAnonymous: boolean
  kind: string
  linkedUserId: string | null
  linkedUserName: string | null
  /** 一時保管の件数と、そのうち公開済みの件数 */
  messageCount: number
  publishedCount: number
  /** リアクションを付けた公開済みの投稿の件数 */
  reactedCount: number
}

export interface ImportedConversationDto {
  externalConversationId: string
  channelId: string | null
  channelName: string | null
  status: string
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetchWithAuth(url)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : fallback)
  }
  return (await res.json()) as T
}

export function useImportTargetChannels(enabled: boolean) {
  const t = useT()
  return useQuery<WorkspaceChannelDto[]>({
    queryKey: ['workspace-channels'],
    queryFn: () => getJson('/api/workspaces/channels', t('Could not load channels')),
    enabled,
  })
}

export function useImportIdentities(source: string, enabled: boolean) {
  const t = useT()
  return useQuery<ImportedIdentityDto[]>({
    queryKey: ['import-identities', source],
    queryFn: () => getJson(`/api/imports/identities?source=${encodeURIComponent(source)}`, t('Could not load imported participants')),
    enabled,
  })
}

export function useImportedConversations(source: string, enabled: boolean) {
  const t = useT()
  return useQuery<ImportedConversationDto[]>({
    queryKey: ['imported-conversations', source],
    queryFn: () => getJson(`/api/imports/conversations?source=${encodeURIComponent(source)}`, t('Could not load previous imports')),
    enabled,
  })
}

/** 取り込みを使えるか（allowed: 運営者で owner / admin）と、取り込んだ投稿者を紐づけられるか（canLink: owner / admin で取り込んだ投稿者がいる）。設定の入口の出し分けに使う */
export function useImportAccess(enabled: boolean) {
  const t = useT()
  return useQuery<{ allowed: boolean; canLink: boolean }>({
    queryKey: ['import-access'],
    queryFn: () => getJson('/api/imports/access', t('Could not check access to importing')),
    enabled,
    staleTime: 5 * 60_000,
  })
}
