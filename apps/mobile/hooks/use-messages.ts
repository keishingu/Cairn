import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface MessageDto {
  id: string
  content: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  reactions: { emoji: string; count: number; mine: boolean; userNames: string[] }[]
  attachments: {
    id: string
    fileId: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
    displayOrder: number
  }[]
}

export function parseMentions(content: string): string {
  return content.replace(/<@[^|]+\|([^>]+)>/g, '@$1')
}

export function useMessages(channelId: string | null) {
  return useQuery<MessageDto[]>({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      const res = await apiFetch(`/api/channels/${channelId}/messages`)
      if (!res.ok) throw new Error(`メッセージの取得に失敗しました (${res.status})`)
      return res.json() as Promise<MessageDto[]>
    },
    enabled: !!channelId,
    refetchInterval: 5000,
  })
}

export function useSendMessage(channelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(`メッセージの送信に失敗しました (${res.status})`)
      return res.json() as Promise<MessageDto>
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
      await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
    },
  })
}

export function useToggleReaction(channelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) throw new Error(`リアクションの更新に失敗しました (${res.status})`)
      return res.json() as Promise<{ added: boolean; emoji: string; count: number }>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', channelId] }),
  })
}

export function useMarkChannelRead(channelId: string) {
  return useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
    },
  })
}
