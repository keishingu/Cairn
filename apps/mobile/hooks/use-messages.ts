import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface MessageDto {
  id: string
  content: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  reactions: { emoji: string; count: number; mine: boolean }[]
  attachments: {
    id: string
    fileId: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
    displayOrder: number
  }[]
}

// サーバーが read 時に `<@userId|表示名>` へ解決済みのため最新名を表示できる。
// 名前なしの canonical 形式 `<@userId>` が来た場合も素のトークンを見せないようにする。
export function parseMentions(content: string): string {
  return content.replace(/<@([^|>\s]+)(?:\|([^>\n]+))?>/g, (_full, _id, name) => name ? `@${name}` : '@メンバー')
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
      await qc.invalidateQueries({ queryKey: ['project-channels'] })
    },
  })
}

export function useMarkChannelRead(channelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-channels'] })
    },
  })
}
