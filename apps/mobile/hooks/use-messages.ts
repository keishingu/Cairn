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

// status を保持し、403（アクセス権なし）を通常の取得失敗と区別して
// 専用の案内を出すために使う（CLAUDE.md: フロントは生の 401/403 を出さない）
export class ChannelMessagesError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChannelMessagesError'
    this.status = status
  }
}

// 401/403 は生のステータスコードを出さず、意味の分かる文言に変換する
function friendlyMessageErrorText(status: number, fallback: string, forbiddenText: string): string {
  if (status === 401) return 'セッションが切れました。再度ログインしてください。'
  if (status === 403) return forbiddenText
  return `${fallback} (${status})`
}

export function useMessages(channelId: string | null) {
  return useQuery<MessageDto[]>({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      const res = await apiFetch(`/api/channels/${channelId}/messages`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new ChannelMessagesError(data.error ?? `メッセージの取得に失敗しました (${res.status})`, res.status)
      }
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
      if (!res.ok) throw new Error(friendlyMessageErrorText(res.status, 'メッセージの送信に失敗しました', 'このチャンネルへの送信権限がありません。'))
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
      if (!res.ok) throw new Error(friendlyMessageErrorText(res.status, 'リアクションの更新に失敗しました', 'このメッセージへの操作権限がありません。'))
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })
}
