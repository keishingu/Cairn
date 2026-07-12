import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AttachmentDto, MessageType } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'

export interface MessageDto {
  id: string
  content: string
  messageType: MessageType
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  createdAt: string
  isEdited: boolean
  reactions: { emoji: string; count: number; mine: boolean; userNames: string[] }[]
  attachments: AttachmentDto[]
  parentMessageId: string | null
  replyTo: { id: string; senderName: string; content: string; isDeleted: boolean } | null
  bookmarked: boolean
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
    // スレッドを開くたびに未読化判定の基準を最新化する。
    // staleTime 内のキャッシュに任せると、直近の新着を取得しないまま既読化してしまう
    refetchOnMount: 'always',
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
      // メッセージ自体は送信済みのため、既読化の副作用が失敗しても送信失敗として扱わない
      try {
        const res = await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
        if (!res.ok) throw new Error(`既読化に失敗しました (${res.status})`)
      } catch (err) {
        console.error('[useSendMessage] 送信後の既読化に失敗:', err)
      }
      await qc.invalidateQueries({ queryKey: ['project-channels'] })
      await qc.invalidateQueries({ queryKey: ['workspace-channels'] })
      await qc.invalidateQueries({ queryKey: ['workspace-dms'] })
    },
  })
}

export function useMarkChannelRead(channelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
      if (!res.ok) throw new Error(`既読化に失敗しました (${res.status})`)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-channels'] })
      await qc.invalidateQueries({ queryKey: ['workspace-channels'] })
      await qc.invalidateQueries({ queryKey: ['workspace-dms'] })
    },
  })
}

export function useToggleMessageReaction(channelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) throw new Error(`リアクションの更新に失敗しました (${res.status})`)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })
}
