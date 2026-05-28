// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationDto } from '@/app/api/notifications/route'

export type { NotificationDto }

export const notificationQueryKeys = {
  list: (filter: string) => ['notifications', filter] as const,
}

async function fetchNotifications(filter: string): Promise<NotificationDto[]> {
  const res = await fetch(`/api/notifications?filter=${filter}`)
  if (!res.ok) throw new Error('通知の取得に失敗しました')
  return res.json()
}

async function markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  const res = await fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  })
  if (!res.ok) throw new Error('既読処理に失敗しました')
  return res.json()
}

export function useNotifications(filter: string) {
  return useQuery({
    queryKey: notificationQueryKeys.list(filter),
    queryFn: () => fetchNotifications(filter),
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨日'
  return `${days}日前`
}
