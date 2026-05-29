import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface NotificationDto {
  id: string
  type: 'mention' | 'task' | 'file' | 'status' | 'invite' | 'reaction' | 'ai'
  title: string
  body: string
  data: Record<string, string> | null
  readAt: string | null
  createdAt: string
}

export function useNotifications() {
  return useQuery<NotificationDto[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiFetch('/api/notifications')
      if (!res.ok) throw new Error(`通知の取得に失敗しました (${res.status})`)
      return res.json() as Promise<NotificationDto[]>
    },
    refetchInterval: 30_000,
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
