import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AttachmentDto,
  MessageType,
  ProfileAttributeDto,
  ProjectMemberRole,
} from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'
import { invalidateChannelListQueries } from '../lib/channel-list-queries'
import { mergeChatMessages, nextMessagePageCursor } from '../lib/mobile-chat-state'
import { useT } from '../components/locale-provider'

export interface MessageDto {
  id: string
  content: string
  messageType: MessageType
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  senderProfileAttributes?: ProfileAttributeDto[]
  senderProjectRole?: ProjectMemberRole | null
  senderProjectRoleName?: string | null
  senderProjectRoleColor?: string | null
  senderProjectRoleLegacy?: ProjectMemberRole | null
  createdAt: string
  isEdited: boolean
  reactions: { emoji: string; count: number; mine: boolean; userNames: string[] }[]
  attachments: AttachmentDto[]
  parentMessageId: string | null
  replyTo: { id: string; senderName: string; content: string; isDeleted: boolean } | null
  bookmarked: boolean
  blocked?: boolean
}

// サーバーが read 時に `<@id|表示名>` へ解決済みのため最新名を表示できる。
// 名前なしの canonical 形式 `<@id>` が来た場合も素のトークンを見せないようにする。
export function parseMentions(content: string, t: (message: string, values?: Record<string, string | number>) => string = (message) => message): string {
  return content.replace(/<@([^|>\s]+)(?:\|([^>\n]+))?>/g, (_full, id: string, name?: string) => {
    if (name) return `@${name}`
    if (id === 'all') return '@all'
    if (id === 'project_members') return '@project_members'
    if (id.startsWith('attr:')) return t('@Attribute')
    return t('@Member')
  })
}

// status を保持し、403（アクセス権なし）を通常の取得失敗と区別して
// 専用の案内を出すために使う（AGENTS.md: フロントは生の 401/403 を出さない）
export class ChannelMessagesError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChannelMessagesError'
    this.status = status
  }
}

export class MessageSendError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MessageSendError'
    this.status = status
  }
}

// 401/403 は生のステータスコードを出さず、意味の分かる文言に変換する
function friendlyMessageErrorText(status: number, fallback: string, forbiddenText: string, t: (message: string, values?: Record<string, string | number>) => string = (message) => message): string {
  if (status === 401) return t('Your session has expired. Please sign in again.')
  if (status === 403) return forbiddenText
  return `${fallback} (${status})`
}

interface MessagePage {
  messages: MessageDto[]
  hasMore: boolean
}

async function fetchMessagePage(
  channelId: string,
  before: string | null,
  t: (message: string, values?: Record<string, string | number>) => string,
): Promise<MessagePage> {
  const suffix = before ? `?before=${encodeURIComponent(before)}` : ''
  const res = await apiFetch(`/api/channels/${channelId}/messages${suffix}`)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ChannelMessagesError(
      data.error ?? t('Could not load messages ({status})', { status: res.status }),
      res.status,
    )
  }
  return {
    messages: (await res.json()) as MessageDto[],
    hasMore: res.headers.get('X-Cairn-Has-More') === 'true',
  }
}

export function useMessages(channelId: string | null) {
  const t = useT()
  return useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: ({ pageParam }) => fetchMessagePage(channelId!, pageParam, t),
    initialPageParam: null as string | null,
    getNextPageParam: nextMessagePageCursor,
    select: (data) => mergeChatMessages(...data.pages.map((page) => page.messages)),
    enabled: !!channelId,
    // 新着・編集・削除・リアクションは RealtimeProvider が invalidate するためポーリングしない。
    // スレッドを開くたびに未読化判定の基準を最新化する。
    // staleTime 内のキャッシュに任せると、直近の新着を取得しないまま既読化してしまう
    refetchOnMount: 'always',
  })
}

export function useSendMessage(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      content: string
      clientMessageId?: string
      parentMessageId?: string
      attachmentFileIds?: string[]
    }) => {
      const res = await apiFetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!res.ok)
        throw new MessageSendError(
          friendlyMessageErrorText(
            res.status,
            t('Could not send the message'),
            t('You do not have permission to send to this channel.'),
            t,
          ),
          res.status,
        )
      return res.json() as Promise<MessageDto>
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
      // メッセージ自体は送信済みのため、既読化の副作用が失敗しても送信失敗として扱わない
      try {
        const res = await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
        if (!res.ok) throw new Error(t('Could not mark as read ({status})', { status: res.status }))
      } catch (err) {
        console.error('[useSendMessage] 送信後の既読化に失敗:', err)
      }
      await invalidateChannelListQueries(qc)
    },
  })
}

export function useEditMessage(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await apiFetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(
          data.error ??
            friendlyMessageErrorText(
              res.status,
              t('Could not edit the message'),
              t('You can only edit your own messages.'),
              t,
            ),
        )
      }
      return res.json() as Promise<{ id: string; content: string }>
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })
}

export function useDeleteMessage(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiFetch(`/api/messages/${messageId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(
          data.error ??
            friendlyMessageErrorText(
              res.status,
              t('Could not delete the message'),
              t('You can only delete your own messages.'),
              t,
            ),
        )
      }
      return messageId
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })
}

export function useToggleMessageBookmark(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiFetch(`/api/messages/${messageId}/bookmark`, { method: 'POST' })
      if (!res.ok)
        throw new Error(
          friendlyMessageErrorText(
            res.status,
            t('Could not update the bookmark'),
            t('You cannot bookmark this message.'),
            t,
          ),
        )
      const result = (await res.json()) as { bookmarked: boolean }
      return { messageId, bookmarked: result.bookmarked }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages', channelId] })
      void qc.invalidateQueries({ queryKey: ['bookmarks'] })
    },
  })
}

export function useMarkChannelRead(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/channels/${channelId}/read`, { method: 'POST' })
      if (!res.ok) throw new Error(t('Could not mark as read ({status})', { status: res.status }))
    },
    onSuccess: () => invalidateChannelListQueries(qc),
  })
}

export function useToggleMessageReaction(channelId: string) {
  const t = useT()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok)
        throw new Error(
          friendlyMessageErrorText(
            res.status,
            t('Could not update the reaction'),
            t('You cannot change reactions on this message.'),
            t,
          ),
        )
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['messages', channelId] })
    },
  })
}
