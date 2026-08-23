import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { generateId } from '@/lib/generate-id'
import type { AttachmentDto } from '@cairn/shared'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'
import type { MessageDto, ReactionDto, ReplyToDto } from '@/app/api/channels/[channelId]/messages/route'
import type { BookmarkDto } from '@/app/api/me/bookmarks/route'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { ChannelReadPositionDto } from '@/app/api/channels/[channelId]/read/route'

export const chatQueryKeys = {
  projectChannels: ['project-channels'] as const,
  workspaceChannels: ['workspace-channels'] as const,
  workspaceMembers: ['workspace-members', 'active'] as const,
  dms: ['dms'] as const,
  messagesRoot: ['messages'] as const,
  messages: (channelId: string | null) => ['messages', channelId] as const,
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

async function fetchChannelMembers(channelId: string): Promise<{ userId: string }[]> {
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

async function fetchChannelReadPosition(channelId: string): Promise<ChannelReadPositionDto> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/read`)
  if (!res.ok) throw new Error('既読位置の取得に失敗しました')
  return res.json()
}

// ブックマーク・パーマリンクのジャンプ先が直近100件の外にある場合に、その前後のウィンドウを取得する
async function fetchChannelMessagesAround(channelId: string, messageId: string): Promise<MessageDto[]> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages?around=${messageId}`)
  if (!res.ok) throw new Error('メッセージの取得に失敗しました')
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

async function fetchChannelMessagesFrom(channelId: string, messageId: string): Promise<{ messages: MessageDto[]; hasNewer: boolean }> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages?from=${encodeURIComponent(messageId)}`)
  if (!res.ok) throw new Error('未読メッセージの取得に失敗しました')
  return {
    messages: await res.json() as MessageDto[],
    hasNewer: res.headers.get('X-Cairn-Has-Newer') === 'true',
  }
}

async function fetchChannelMessagesAfter(channelId: string, messageId: string): Promise<{ messages: MessageDto[]; hasNewer: boolean }> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages?after=${encodeURIComponent(messageId)}`)
  if (!res.ok) throw new Error('新しいメッセージの取得に失敗しました')
  return {
    messages: await res.json() as MessageDto[],
    hasNewer: res.headers.get('X-Cairn-Has-Newer') === 'true',
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

export function useChannelReadPosition(channelId: string | null) {
  return useQuery({
    queryKey: ['channel-read-position', channelId] as const,
    queryFn: () => fetchChannelReadPosition(channelId!),
    enabled: !!channelId,
  })
}

// 既存のキャッシュに無い古いメッセージ（ブックマーク・パーマリンクのジャンプ先）を
// 前後のウィンドウごと取得してキャッシュへマージする。直近100件の外にあるメッセージへ
// ジャンプしても表示されず静かに失敗する問題への対処
export function useEnsureMessageLoaded(channelId: string | null) {
  const queryClient = useQueryClient()
  return React.useCallback(async (messageId: string) => {
    if (!channelId) return false
    const current = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
    if (current?.some(m => m.id === messageId)) return true
    try {
      const windowMessages = await fetchChannelMessagesAround(channelId, messageId)
      if (windowMessages.length === 0) return false
      queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), prev => {
        const merged = new Map((prev ?? []).map(m => [m.id, m]))
        for (const m of windowMessages) merged.set(m.id, m)
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
      return windowMessages.some(message => message.id === messageId)
    } catch {
      // サイレントに失敗（ハイライト・スクロールされないだけで致命的ではない）
      return false
    }
  }, [channelId, queryClient])
}

/** 表示済みの最古メッセージをカーソルに、さらに古いページをキャッシュ先頭へ追加する。 */
export function useLoadOlderChannelMessages(channelId: string | null) {
  const queryClient = useQueryClient()
  const [hasMore, setHasMore] = React.useState(true)
  const [hasNewer, setHasNewer] = React.useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false)
  const [isLoadingNewer, setIsLoadingNewer] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)
  const [newerError, setNewerError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    setHasMore(true)
    setHasNewer(false)
    setError(null)
    setNewerError(null)
  }, [channelId])

  const initializeFrom = React.useCallback(async (messageId: string): Promise<boolean> => {
    if (!channelId) return false
    const current = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
    if (current?.some(message => message.id === messageId)) {
      setHasNewer(false)
      return true
    }

    setIsLoadingNewer(true)
    setNewerError(null)
    try {
      const page = await fetchChannelMessagesFrom(channelId, messageId)
      if (!page.messages.some(message => message.id === messageId)) return false
      queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), page.messages)
      setHasMore(true)
      setHasNewer(page.hasNewer)
      return true
    } catch (cause) {
      setNewerError(cause instanceof Error ? cause : new Error('未読メッセージの取得に失敗しました'))
      return false
    } finally {
      setIsLoadingNewer(false)
    }
  }, [channelId, queryClient])

  const loadOlder = React.useCallback(async (): Promise<boolean> => {
    if (!channelId || isLoadingOlder || !hasMore) return false
    const current = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
    const oldest = current?.[0]
    if (!oldest) return false

    setIsLoadingOlder(true)
    setError(null)
    try {
      const page = await fetchChannelMessagesBefore(channelId, oldest.id)
      if (page.messages.length > 0) {
        queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), previous => {
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
  }, [channelId, hasMore, isLoadingOlder, queryClient])

  const loadNewer = React.useCallback(async (): Promise<boolean> => {
    if (!channelId || isLoadingNewer || !hasNewer) return false
    const current = queryClient.getQueryData<MessageDto[]>(chatQueryKeys.messages(channelId))
    const newest = current?.[current.length - 1]
    if (!newest) return false

    setIsLoadingNewer(true)
    setNewerError(null)
    try {
      const page = await fetchChannelMessagesAfter(channelId, newest.id)
      if (page.messages.length > 0) {
        queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), previous => {
          const merged = new Map((previous ?? []).map(message => [message.id, message]))
          for (const message of page.messages) merged.set(message.id, message)
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        })
      }
      setHasNewer(page.hasNewer)
      return page.messages.length > 0
    } catch (cause) {
      setNewerError(cause instanceof Error ? cause : new Error('新しいメッセージの取得に失敗しました'))
      return false
    } finally {
      setIsLoadingNewer(false)
    }
  }, [channelId, hasNewer, isLoadingNewer, queryClient])

  const loadLatest = React.useCallback(async (): Promise<boolean> => {
    if (!channelId || isLoadingNewer) return false
    setIsLoadingNewer(true)
    setNewerError(null)
    try {
      const latest = await fetchChannelMessages(channelId)
      queryClient.setQueryData<MessageDto[]>(chatQueryKeys.messages(channelId), latest)
      setHasNewer(false)
      return true
    } catch (cause) {
      setNewerError(cause instanceof Error ? cause : new Error('最新メッセージの取得に失敗しました'))
      return false
    } finally {
      setIsLoadingNewer(false)
    }
  }, [channelId, isLoadingNewer, queryClient])

  return {
    initializeFrom,
    loadOlder,
    loadNewer,
    loadLatest,
    hasMore,
    hasNewer,
    isLoadingOlder,
    isLoadingNewer,
    error,
    newerError,
  }
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
