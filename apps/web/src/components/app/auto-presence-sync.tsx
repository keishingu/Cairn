// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CurrentUserDto } from '@/app/api/me/route'
import { useCurrentUser } from '@/hooks/use-current-user'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useAutoPresence } from '@/lib/use-auto-presence'
import type { UserStatus } from '@/lib/user-status'

export function AutoPresenceSync() {
  const queryClient = useQueryClient()
  const { data: me } = useCurrentUser()

  const statusMutation = useMutation({
    mutationFn: async ({ status, keepalive }: { status: UserStatus; keepalive?: boolean }) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(keepalive !== undefined ? { keepalive } : {}),
        body: JSON.stringify({ status }),
      })
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
