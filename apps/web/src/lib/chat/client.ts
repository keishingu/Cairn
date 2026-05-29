import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { generateId } from '@/lib/generate-id'
import type { AttachmentDto } from '@cairn/shared'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'
import type { MessageDto, ReactionDto } from '@/app/api/channels/[channelId]/messages/route'
import type { CurrentUserDto } from '@/app/api/me/route'

export const chatQueryKeys = {
  projectChannels: ['project-channels'] as const,
  workspaceChannels: ['workspace-channels'] as const,
  workspaceMembers: ['workspace-members'] as const,
  dms: ['dms'] as const,
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
  return channels.find((channel) => channel.projectId === projectId) ?? null
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
  const res = await fetchWithAuth('/api/workspaces/members')
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
  if (!res.ok) return []
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

async function createDm(targetUserId: string): Promise<{ id: string }> {
  const res = await fetchWithAuth('/api/workspaces/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  if (!res.ok) throw new Error('DMの作成に失敗しました')
  return res.json()
}

async function fetchChannelMessages(channelId: string): Promise<MessageDto[]> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages`)
  if (!res.ok) throw new Error('メッセージの取得に失敗しました')
  return res.json()
}

interface SendMessageInput {
  content: string
  attachmentFileIds?: string[]
  optimisticAttachments?: AttachmentDto[]
}

async function postChannelMessage(channelId: string, input: SendMessageInput): Promise<MessageDto> {
  const res = await fetchWithAuth(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input.content, attachmentFileIds: input.attachmentFileIds }),
  })
  if (!res.ok) throw new Error('メッセージの送信に失敗しました')
  return res.json()
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
  return useQuery({
    queryKey: chatQueryKeys.messages(channelId),
    queryFn: () => fetchChannelMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })
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
          senderId: currentUser.id,
          senderName: currentUser.displayName,
          senderAvatarUrl: currentUser.avatarUrl,
          createdAt: new Date().toISOString(),
          reactions: [],
          attachments: input.optimisticAttachments ?? [],
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
      // POST レスポンスの attachments は空のため、楽観的データを維持して次のポーリングまで表示を保つ
      const finalMessage: MessageDto = {
        ...newMessage,
        attachments: newMessage.attachments.length > 0
          ? newMessage.attachments
          : (input.optimisticAttachments ?? []),
      }
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (old) => (old ?? []).map((m) => m.id === context?.optimisticId ? finalMessage : m),
      )
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

export function useToggleMessageReaction(channelId: string | null) {
  const queryClient = useQueryClient()

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
                ? m.reactions.map((r) => r.emoji === emoji ? { ...r, count: newCount, mine: false } : r)
                : m.reactions.filter((r) => r.emoji !== emoji)
            } else {
              newReactions = m.reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r)
            }
          } else {
            newReactions = [...m.reactions, { emoji, count: 1, mine: true }]
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
