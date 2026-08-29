import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { generateId } from '@/lib/generate-id'
import { parseCheckboxes } from '@/lib/chat/checkboxes'
import type { AttachmentDto } from '@cairn/shared'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'
import type { MessageDto, ReactionDto, ReplyToDto } from '@/app/api/channels/[channelId]/messages/route'
import type { ChannelMemberDto } from '@/app/api/channels/[channelId]/members/route'
import type { BookmarkDto } from '@/app/api/me/bookmarks/route'
import type { CurrentUserDto } from '@/app/api/me/route'

export const chatQueryKeys = {
  projectChannels: ['project-channels'] as const,
  workspaceChannels: ['workspace-channels'] as const,
  workspaceMembers: ['workspace-members', 'active'] as const,
  dms: ['dms'] as const,
  messagesRoot: ['messages'] as const,
  messages: (channelId: string | null) => ['messages', channelId] as const,
  messageHistory: (channelId: string | null, messageId: string | null) => ['message-history', channelId, messageId] as const,
  initialMessage: (channelId: string | null) => ['channel-initial-message', channelId] as const,
  currentUser: ['current-user'] as const,
}

const CHANNEL_LISTS = [
  ['project-channels'],
  ['workspace-channels'],
  ['dms'],
] as const

export function formatChatMessageTime(iso: string): string {
  const source = new Date(iso)
  return `${source.getMonth() + 1}/${source.getDate()} ${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}`
}

export function findProjectChannelById(
  channels: ProjectChannelDto[],
  projectId: string,
): ProjectChannelDto | null {
  return channels.find((channel) => channel.projectId === projectId && channel.milestoneId === null) ?? null
}

async function fetchProjectChannels(): Promise<ProjectChannelDto[]> {
  const res = await fetchWithAuth('/api/projects/channels')
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました')
  return res.json()
}

async function fetchWorkspaceChannels(): Promise<WorkspaceChannelDto[]> {
  const res = await fetchWithAuth('/api/workspaces/channels')
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました')
  return res.json()
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMemberDto[]> {
  const res = await fetchWithAuth('/api/workspaces/members?status=active')
  if (!res.ok) throw new Error('メンバーの取得に失敗しました')
  return res.json()
}

async function fetchDms(): Promise<DmChannelDto[]> {
  const res = await fetchWithAuth('/api/workspaces/dms')
  if (!res.ok) throw new Error('DMの取得に失敗しました')
  return res.json()
}

async function fetchChannelMembers(channelId: string): Promise<ChannelMemberDto[]> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/members`)
  if (!res.ok) throw new Error('チャンネルメンバーの取得に失敗しました')
  return res.json()
}

async function addChannelMember(channelId: string, userId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'メンバーの追加に失敗しました')
  }
}

async function createWorkspaceChannel(body: { name: string; isPrivate: boolean }): Promise<WorkspaceChannelDto> {
  const res = await fetchWithAuth('/api/workspaces/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'チャンネルの作成に失敗しました')
  }
  return res.json()
}

async function createChannelThread(channelId: string, name: string): Promise<{ id: string }> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'スレッドの作成に失敗しました')
  }
  return res.json()
}

async function createDm(targetUserId: string): Promise<{ id: string }> {
  const res = await fetchWithAuth('/api/workspaces/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  if (!res.ok) throw new Error('DMの作成に失敗しました')
  return res.json()
}

// メッセージ取得エラー。status を保持し、UI 側で 403（アクセス権なし）を
// 「メッセージの取得失敗」と区別して専用の案内を出すために使う。
export class ChannelMessagesError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ChannelMessagesError'
    this.status = status
  }
}

async function fetchChannelMessages(channelId: string): Promise<MessageDto[]> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new ChannelMessagesError(data.error ?? 'メッセージの取得に失敗しました', res.status)
  }
  return res.json()
}

// ブックマーク・パーマリンクのジャンプ先が直近100件の外にある場合に、その前後のウィンドウを取得する
async function fetchChannelMessagesAround(channelId: string, messageId: string): Promise<MessageDto[]> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages?around=${messageId}`)
  if (!res.ok) throw new Error('メッセージの取得に失敗しました')
  return res.json()
}

async function fetchChannelInitialMessage(channelId: string): Promise<{ messageId: string | null }> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/read`)
  if (!res.ok) throw new Error('既読位置の取得に失敗しました')
  return res.json()
}

async function fetchChannelMessagesBefore(channelId: string, messageId: string): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages?before=${encodeURIComponent(messageId)}`)
  if (!res.ok) throw new Error('過去のメッセージの取得に失敗しました')
  return {
    messages: await res.json() as MessageDto[],
    hasMore: res.headers.get('X-Cairn-Has-More') === 'true',
  }
}

interface SendMessageInput {
  content: string
  attachmentFileIds?: string[]
  optimisticAttachments?: AttachmentDto[]
  parentMessageId?: string
  optimisticReplyTo?: ReplyToDto | null
}

async function postChannelMessage(channelId: string, input: SendMessageInput): Promise<MessageDto> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      attachmentFileIds: input.attachmentFileIds,
      parentMessageId: input.parentMessageId,
    }),
  })
  if (!res.ok) throw new Error('メッセージの送信に失敗しました')
  return res.json()
}

async function toggleMessageBookmark(messageId: string): Promise<{ bookmarked: boolean }> {
  const res = await fetchWithAuth(`/api/messages/${messageId}/bookmark`, { method: 'POST' })
  if (!res.ok) throw new Error('ブックマークの更新に失敗しました')
  return res.json()
}

async function fetchBookmarks(): Promise<BookmarkDto[]> {
  const res = await fetchWithAuth('/api/me/bookmarks')
  if (!res.ok) throw new Error('ブックマークの取得に失敗しました')
  return res.json()
}

async function editMessage(messageId: string, content: string): Promise<{ id: string; content: string }> {
  const res = await fetchWithAuth(`/api/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'メッセージの編集に失敗しました')
  }
  return res.json()
}

async function deleteMessage(messageId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/messages/${messageId}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'メッセージの削除に失敗しました')
  }
}

async function toggleMessageReaction(messageId: string, emoji: string): Promise<void> {
  const res = await fetchWithAuth(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  })
  if (!res.ok) throw new Error('リアクションの更新に失敗しました')
}

async function fetchCurrentUser(): Promise<CurrentUserDto> {
  const res = await fetchWithAuth('/api/me')
  if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました')
  return res.json()
}

// 未読バッジの更新は RealtimeProvider 経由（messages / channel_read_states の購読）。
// 配線は apps/web/src/components/realtime/realtime-provider.tsx を参照
export function useProjectChannels() {
  return useQuery({
    queryKey: chatQueryKeys.projectChannels,
    queryFn: fetchProjectChannels,
  })
}

export function useWorkspaceChannels() {
  return useQuery({
    queryKey: chatQueryKeys.workspaceChannels,
    queryFn: fetchWorkspaceChannels,
  })
}

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: chatQueryKeys.workspaceMembers,
    queryFn: fetchWorkspaceMembers,
  })
}

export function useWorkspaceDms() {
  return useQuery({
    queryKey: chatQueryKeys.dms,
    queryFn: fetchDms,
    enabled: FEATURE_FLAGS.dm,
  })
}

export function useChannelMembers(channelId: string | null) {
  return useQuery({
    queryKey: ['channel-members', channelId] as const,
    queryFn: () => fetchChannelMembers(channelId!),
    enabled: !!channelId,
  })
}

export function useAddChannelMember(channelId: string | null) {
  return useMutation({
    mutationFn: (userId: string) => addChannelMember(channelId!, userId),
  })
}

export function useCreateChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; isPrivate: boolean }) => createWorkspaceChannel(body),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.workspaceChannels })
    },
    onSuccess: (channel) => {
      queryClient.setQueryData<WorkspaceChannelDto[]>(
        chatQueryKeys.workspaceChannels,
        (old) => [...(old ?? []), channel],
      )
    },
  })
}

export function useCreateChannelThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ channelId, name }: { channelId: string; name: string }) => createChannelThread(channelId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.workspaceChannels })
    },
  })
}

export function useCreateDm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: string) => createDm(targetUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.dms })
    },
  })
}

export function useCurrentUser() {
  return useQuery({
    queryKey: chatQueryKeys.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: Infinity,
  })
}

export function useChannelMessages(channelId: string | null) {
  // 新着・編集・削除・リアクションは RealtimeProvider が messages / message_reactions の
  // 購読で invalidate するためポーリングしない
  return useQuery({
    queryKey: chatQueryKeys.messages(channelId),
    queryFn: () => fetchChannelMessages(channelId!),
    enabled: !!channelId,
  })
}

export function useChannelInitialMessage(channelId: string | null) {
  return useQuery({
    queryKey: chatQueryKeys.initialMessage(channelId),
    queryFn: () => fetchChannelInitialMessage(channelId!),
    enabled: !!channelId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

// 最新100件とは別キャッシュにし、Realtime の通常 invalidate で履歴表示を上書きしない。
export function useChannelMessageHistory(channelId: string | null, messageId: string | null) {
  return useQuery({
    queryKey: chatQueryKeys.messageHistory(channelId, messageId),
    queryFn: () => fetchChannelMessagesAround(channelId!, messageId!),
    enabled: !!channelId && !!messageId,
  })
}

// /chats 以外の既存 ChatThread は、従来どおり古いジャンプ先を最新キャッシュへ足す。
export function useEnsureMessageLoaded(channelId: string | null) {
  const queryClient = useQueryClient()
  return React.useCallback(async (messageId: string) => {
    if (!channelId) return
    const current = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
    if (current?.some(message => message.id === messageId)) return
    try {
      const windowMessages = await fetchChannelMessagesAround(channelId, messageId)
      if (windowMessages.length === 0) return
      queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), previous => {
        const merged = new Map((previous ?? []).map(message => [message.id, message]))
        for (const message of windowMessages) merged.set(message.id, message)
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
    } catch {
      // ジャンプできないだけで会話の通常表示は継続する。
    }
  }, [channelId, queryClient])
}

/** 表示済みの最古メッセージをカーソルに、さらに古いページをキャッシュ先頭へ追加する。 */
export function useLoadOlderChannelMessages(channelId: string | null, historyMessageId: string | null = null) {
  const queryClient = useQueryClient()
  const [hasMore, setHasMore] = React.useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    setHasMore(true)
    setError(null)
  }, [channelId, historyMessageId])

  const loadOlder = React.useCallback(async (): Promise<boolean> => {
    if (!channelId || isLoadingOlder || !hasMore) return false
    const queryKey = historyMessageId
      ? chatQueryKeys.messageHistory(channelId, historyMessageId)
      : chatQueryKeys.messages(channelId)
    const current = queryClient.getQueryData<MessageDto[]>(queryKey)
    const oldest = current?.[0]
    if (!oldest) return false

    setIsLoadingOlder(true)
    setError(null)
    try {
      const page = await fetchChannelMessagesBefore(channelId, oldest.id)
      if (page.messages.length > 0) {
        queryClient.setQueryData<MessageDto[]>(queryKey, previous => {
          const merged = new Map((previous ?? []).map(message => [message.id, message]))
          for (const message of page.messages) merged.set(message.id, message)
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        })
      }
      setHasMore(page.hasMore)
      return page.messages.length > 0
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('過去のメッセージの取得に失敗しました'))
      return false
    } finally {
      setIsLoadingOlder(false)
    }
  }, [channelId, hasMore, historyMessageId, isLoadingOlder, queryClient])

  return { loadOlder, hasMore, isLoadingOlder, error }
}

export function useSendChannelMessage(
  channelId: string | null,
  currentUser: CurrentUserDto | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SendMessageInput) => postChannelMessage(channelId!, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.messages(channelId) })
      const prev = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))

      if (currentUser) {
        const optimisticMsg: MessageDto = {
          id: `optimistic-${generateId()}`,
          content: input.content,
          messageType: 'text',
          senderId: currentUser.id,
          senderName: currentUser.displayName,
          senderAvatarUrl: currentUser.avatarUrl,
          createdAt: new Date().toISOString(),
          isEdited: false,
          reactions: [],
          attachments: input.optimisticAttachments ?? [],
          parentMessageId: input.parentMessageId ?? null,
          replyTo: input.optimisticReplyTo ?? null,
          bookmarked: false,
        }
        queryClient.setQueryData<MessageDto[]>(
          chatQueryKeys.messages(channelId),
          (old) => [...(old ?? []), optimisticMsg],
        )
        return { prev, optimisticId: optimisticMsg.id }
      }

      return { prev, optimisticId: null }
    },
    onError: (_err, _input, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(chatQueryKeys.messages(channelId), context.prev)
      }
    },
    onSuccess: (newMessage, input, context) => {
      // POST レスポンスの attachments・replyTo は空のため、楽観的データを維持して次の再取得まで表示を保つ
      const finalMessage: MessageDto = {
        ...newMessage,
        attachments: newMessage.attachments.length > 0
          ? newMessage.attachments
          : (input.optimisticAttachments ?? []),
        replyTo: newMessage.replyTo ?? input.optimisticReplyTo ?? null,
      }
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => m.id === context?.optimisticId ? finalMessage : m),
      )
      if ((input.optimisticAttachments?.length ?? 0) > 0) {
        void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
      }
      if (parseCheckboxes(input.content).length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      }
    },
  })
}

export function useMarkChannelRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channelId: string) =>
      fetchWithAuth(`/api/channels/${channelId}/read`, { method: 'POST' }).then(r => {
        if (!r.ok) throw new Error('既読処理に失敗しました')
      }),
    onSuccess: () => {
      for (const key of CHANNEL_LISTS) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}

export function useEditMessage(channelId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      editMessage(messageId, content),
    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.messages(channelId) })
      const prev = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => m.id === messageId ? { ...m, content, isEdited: true } : m),
      )
      return { prev }
    },
    onSuccess: (updated) => {
      // Realtime の invalidate は他イベントとの競合で古いデータを取り戻すことがあるため、
      // PATCH レスポンスを正としてキャッシュへ反映する
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => m.id === updated.id ? { ...m, content: updated.content, isEdited: true } : m),
      )
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(chatQueryKeys.messages(channelId), context.prev)
      }
    },
  })
}

export function useDeleteMessage(channelId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.messages(channelId) })
      const prev = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).filter((m) => m.id !== messageId),
      )
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(chatQueryKeys.messages(channelId), context.prev)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useToggleMessageReaction(
  channelId: string | null,
  currentUser?: Pick<CurrentUserDto, 'displayName'>,
) {
  const queryClient = useQueryClient()
  const myName = currentUser?.displayName ?? 'あなた'

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      toggleMessageReaction(messageId, emoji),
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.messages(channelId) })
      const prev = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))

      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => {
          if (m.id !== messageId) return m
          const existing = m.reactions.find((r) => r.emoji === emoji)
          let newReactions: ReactionDto[]
          if (existing) {
            if (existing.mine) {
              const newCount = existing.count - 1
              newReactions = newCount > 0
                ? m.reactions.map((r) => r.emoji === emoji
                  ? { ...r, count: newCount, mine: false, userNames: r.userNames.filter((name) => name !== myName) }
                  : r)
                : m.reactions.filter((r) => r.emoji !== emoji)
            } else {
              newReactions = m.reactions.map((r) => r.emoji === emoji
                ? {
                    ...r,
                    count: r.count + 1,
                    mine: true,
                    userNames: r.userNames.includes(myName) ? r.userNames : [...r.userNames, myName],
                  }
                : r)
            }
          } else {
            newReactions = [...m.reactions, { emoji, count: 1, mine: true, userNames: [myName] }]
          }
          return { ...m, reactions: newReactions }
        }),
      )

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(chatQueryKeys.messages(channelId), context.prev)
      }
    },
  })
}

export function useToggleBookmark(channelId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (messageId: string) => toggleMessageBookmark(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.messages(channelId) })
      const prev = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => m.id === messageId ? { ...m, bookmarked: !m.bookmarked } : m),
      )
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(chatQueryKeys.messages(channelId), context.prev)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
  })
}

export function useBookmarks(enabled: boolean) {
  return useQuery({
    queryKey: ['bookmarks'] as const,
    queryFn: fetchBookmarks,
    enabled,
  })
}
