// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/components/locale-provider'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { WorkspaceSettingsDto } from '@/app/api/workspaces/settings/route'

const QUERY_KEY = ['workspaceSettings']

export function displayProjectLabel(
  stored: string | null | undefined,
  translate: (message: string) => string,
): string {
  if (!stored) return translate('Projects')
  return stored
}

async function fetchSettings(): Promise<WorkspaceSettingsDto> {
  const res = await fetchWithAuth('/api/workspaces/settings')
  if (!res.ok) throw new Error('Failed to fetch workspace settings')
  return res.json()
}

async function patchSettings(data: Partial<WorkspaceSettingsDto>): Promise<WorkspaceSettingsDto> {
  const res = await fetchWithAuth('/api/workspaces/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update workspace settings')
  return res.json()
}

// 応答は更新時点の全設定を含むため、そのまま置き換えると、並行した別項目の更新の結果を
// 古い値で戻してしまう（例: モデル変更の応答が、直前に保存したシステムプロンプトを古い値へ戻す）。
// 送った項目だけを応答の値で反映する。
export function mergePatchedFields(
  current: WorkspaceSettingsDto,
  updated: WorkspaceSettingsDto,
  patch: Partial<WorkspaceSettingsDto>,
): WorkspaceSettingsDto {
  const merged: WorkspaceSettingsDto = { ...current }
  for (const key of Object.keys(patch) as (keyof WorkspaceSettingsDto)[]) {
    Object.assign(merged, { [key]: updated[key] })
  }
  return merged
}

export function useWorkspaceSettings() {
  return useQuery<WorkspaceSettingsDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProjectLabel(): string {
  const t = useT()
  const { data } = useWorkspaceSettings()
  return displayProjectLabel(data?.projectLabel, t)
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchSettings,
    onSuccess: (updated, patch) => {
      queryClient.setQueryData<WorkspaceSettingsDto>(QUERY_KEY, (current) =>
        current ? mergePatchedFields(current, updated, patch) : updated,
      )
    },
  })
}
