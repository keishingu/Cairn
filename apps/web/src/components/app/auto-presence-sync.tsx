// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { WorkspaceDto } from '@/app/api/workspaces/route'
import { useCurrentUser } from '@/hooks/use-current-user'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useAutoPresence } from '@/lib/use-auto-presence'
import type { UserStatus } from '@/lib/user-status'
import { WORKSPACE_HEADER } from '@/lib/workspace-cookie'

export function AutoPresenceSync() {
  const queryClient = useQueryClient()
  const { data: me } = useCurrentUser()
  const { data: workspace } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
    staleTime: 60_000,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ status, keepalive }: { status: UserStatus; keepalive?: boolean }) => {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (workspace?.id) {
        headers.set(WORKSPACE_HEADER, workspace.id)
      }
      const requestInit = {
        method: 'PATCH',
        headers,
        ...(keepalive !== undefined ? { keepalive } : {}),
        body: JSON.stringify({ status }),
      } satisfies RequestInit
      const res = keepalive
        ? await fetch('/api/me', { ...requestInit, credentials: 'same-origin' })
        : await fetchWithAuth('/api/me', requestInit)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスの更新に失敗しました')
      }
      return status
    },
    onSuccess: (status) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status } : prev)
    },
  })

  useAutoPresence({
    status: me?.status,
    workspaceId: workspace?.id ?? null,
    updateStatus: async (status, options) => {
      try {
        await statusMutation.mutateAsync({
          status,
          ...(options?.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
        })
        return true
      } catch {
        return false
      }
    },
  })

  return null
}
