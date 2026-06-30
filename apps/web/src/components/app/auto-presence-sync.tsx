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
import { USER_STATUSES, type UserStatus } from '@/lib/user-status'
import { WORKSPACE_HEADER } from '@/lib/workspace-cookie'

interface PresenceSnapshot {
  status: UserStatus
  auto: boolean
}

export function AutoPresenceSync() {
  const queryClient = useQueryClient()
  const { data: me } = useCurrentUser()
  const { data: workspace } = useQuery<WorkspaceDto>({
    queryKey: ['workspace'],
    queryFn: () => fetchWithAuth('/api/workspaces').then(r => r.json()),
    staleTime: 60_000,
  })

  const statusMutation = useMutation<PresenceSnapshot, Error, { status: UserStatus; keepalive?: boolean }>({
    mutationFn: async ({ status, keepalive }: { status: UserStatus; keepalive?: boolean }) => {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (workspace?.id) {
        headers.set(WORKSPACE_HEADER, workspace.id)
      }
      const requestInit = {
        method: 'PATCH',
        headers,
        ...(keepalive !== undefined ? { keepalive } : {}),
        body: JSON.stringify({ status, auto: true }),
      } satisfies RequestInit
      const res = keepalive
        ? await fetch('/api/me', { ...requestInit, credentials: 'same-origin' })
        : await fetchWithAuth('/api/me', requestInit)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'ステータスの更新に失敗しました')
      }
      const dto = await res.json() as { status?: unknown; statusAuto?: unknown }
      if (typeof dto.status !== 'string' || !USER_STATUSES.includes(dto.status as UserStatus)) {
        throw new Error('ステータス更新レスポンスが不正です')
      }
      return { status: dto.status as UserStatus, auto: dto.statusAuto === true }
    },
    onSuccess: ({ status, auto }) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status, statusAuto: auto } : prev)
    },
  })

  useAutoPresence({
    status: me?.status,
    workspaceId: workspace?.id ?? null,
    updateStatus: async (status, options) => {
      try {
        return await statusMutation.mutateAsync({
          status,
          ...(options?.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
        }).then(snapshot => snapshot.status)
      } catch {
        return null
      }
    },
    readCurrentPresence: async (): Promise<PresenceSnapshot> => {
      const headers = workspace?.id
        ? new Headers({ [WORKSPACE_HEADER]: workspace.id })
        : undefined
      const res = await fetchWithAuth('/api/me', headers ? { headers } : undefined)
      if (!res.ok) {
        throw new Error('現在のステータス取得に失敗しました')
      }
      const current = await res.json() as CurrentUserDto
      return { status: current.status, auto: current.statusAuto }
    },
    observePresence: ({ status, auto }) => {
      queryClient.setQueryData<CurrentUserDto>(['me'], prev => prev ? { ...prev, status, statusAuto: auto } : prev)
    },
  })

  return null
}
