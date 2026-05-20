import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import type { DmChannelDto } from '@/app/api/workspaces/dms/route'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'

export const chatQueryKeys = {
  projectChannels: ['project-channels'] as const,
  workspaceChannels: ['workspace-channels'] as const,
  workspaceMembers: ['workspace-members'] as const,
  dms: ['dms'] as const,
  messages: (channelId: string | null) => ['messages', channelId] as const,
}

export function formatChatMessageTime(iso: string): string {
  const source = new Date(iso)
  return `${source.getMonth() + 1}/${source.getDate()} ${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}`
}

export function findProjectChannelByTitle(
  channels: ProjectChannelDto[],
  projectTitle: string,
): ProjectChannelDto | null {
  return channels.find((channel) => channel.projectTitle === projectTitle) ?? null
}

async function fetchProjectChannels(): Promise<ProjectChannelDto[]> {
  const res = await fetch('/api/projects/channels')
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました')
  return res.json()
}

async function fetchWorkspaceChannels(): Promise<WorkspaceChannelDto[]> {
  const res = await fetch('/api/workspaces/channels')
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました')
  return res.json()
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMemberDto[]> {
  const res = await fetch('/api/workspaces/members')
  if (!res.ok) throw new Error('メンバーの取得に失敗しました')
  return res.json()
}

async function fetchDms(): Promise<DmChannelDto[]> {
  const res = await fetch('/api/workspaces/dms')
  if (!res.ok) throw new Error('DMの取得に失敗しました')
  return res.json()
}

async function createDm(targetUserId: string): Promise<{ id: string }> {
  const res = await fetch('/api/workspaces/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  if (!res.ok) throw new Error('DMの作成に失敗しました')
  return res.json()
}

async function fetchChannelMessages(channelId: string): Promise<MessageDto[]> {
  const res = await fetch(`/api/channels/${channelId}/messages`)
  if (!res.ok) throw new Error('メッセージの取得に失敗しました')
  return res.json()
}

async function postChannelMessage(channelId: string, content: string): Promise<MessageDto> {
  const res = await fetch(`/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('メッセージの送信に失敗しました')
  return res.json()
}

async function toggleMessageReaction(messageId: string, emoji: string): Promise<void> {
  const res = await fetch(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  })
  if (!res.ok) throw new Error('リアクションの更新に失敗しました')
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

export function useCreateDm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: string) => createDm(targetUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.dms })
    },
  })
}

export function useChannelMessages(channelId: string | null) {
  return useQuery({
    queryKey: chatQueryKeys.messages(channelId),
    queryFn: () => fetchChannelMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 5000,
  })
}

export function useSendChannelMessage(channelId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: string) => postChannelMessage(channelId!, content),
    onSuccess: (newMessage) => {
      queryClient.setQueryData<MessageDto[]>(
        chatQueryKeys.messages(channelId),
        (prev) => [...(prev ?? []), newMessage],
      )
    },
  })
}

export function useToggleMessageReaction(channelId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      toggleMessageReaction(messageId, emoji),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(channelId) })
    },
  })
}
