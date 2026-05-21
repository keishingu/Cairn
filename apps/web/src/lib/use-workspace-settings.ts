// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceSettingsDto } from '@/app/api/workspaces/settings/route'

const QUERY_KEY = ['workspaceSettings']
const DEFAULT_PROJECT_LABEL = 'プロジェクト'

async function fetchSettings(): Promise<WorkspaceSettingsDto> {
  const res = await fetch('/api/workspaces/settings')
  if (!res.ok) throw new Error('Failed to fetch workspace settings')
  return res.json()
}

async function patchSettings(data: Partial<WorkspaceSettingsDto>): Promise<WorkspaceSettingsDto> {
  const res = await fetch('/api/workspaces/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update workspace settings')
  return res.json()
}

export function useWorkspaceSettings() {
  return useQuery<WorkspaceSettingsDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProjectLabel(): string {
  const { data } = useWorkspaceSettings()
  return data?.projectLabel || DEFAULT_PROJECT_LABEL
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEY, updated)
    },
  })
}
