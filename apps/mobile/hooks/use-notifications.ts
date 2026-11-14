import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'
import { ApiRequestError } from '../lib/fetch-api-json'
import { fetchWithOfflineCache } from '../lib/offline-cache-store'

export interface NotificationDto {
  id: string
  type: 'mention' | 'dm' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
  title: string
  body: string
  data: Record<string, string> | null
  readAt: string | null
  createdAt: string
}

export function useNotifications() {
  return useQuery<NotificationDto[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      fetchWithOfflineCache(
        { type: 'notifications' },
        async () => {
          const res = await apiFetch('/api/notifications')
          if (!res.ok) throw new ApiRequestError(`通知の取得に失敗しました (${res.status})`, res.status)
          return res.json() as Promise<NotificationDto[]>
        },
        (notifications) => notifications,
      ),
  })
}

export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications?filter=unread&count=1')
      if (!res.ok) throw new Error(`未読通知数の取得に失敗しました (${res.status})`)
      const data = (await res.json()) as { count: number }
      return data.count
    },
  })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[] | null) => {
      const res = await apiFetch('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify(ids ? { ids } : {}),
      })
      if (!res.ok) throw new Error(`既読化に失敗しました (${res.status})`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
