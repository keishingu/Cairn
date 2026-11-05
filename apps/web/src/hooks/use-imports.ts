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
  linkedUserId: string | null
  linkedUserName: string | null
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
