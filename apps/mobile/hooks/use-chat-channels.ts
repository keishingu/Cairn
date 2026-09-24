import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'
import {
  fetchWorkspaceChannels,
  fetchWorkspaceDms,
  projectChannelsQueryKey,
  workspaceChannelsQueryKey,
  workspaceDmsQueryKey,
} from '../lib/channel-list-queries'
import { fetchApiJson } from '../lib/fetch-api-json'

export interface WorkspaceChannelDto {
  id: string
  name: string | null
  parentChannelId?: string | null
  isPrivate: boolean
  memberCount: number
  memberNames: string[]
  memberAvatarUrls: (string | null)[]
  unreadCount: number
  unreadMentionCount: number
}

export interface DmChannelDto {
  id: string
  participantId: string
  participantName: string
  participantAvatarUrl: string | null
  unreadCount: number
  unreadMentionCount: number
}

export interface WorkspaceMemberDto {
  userId: string
  displayName: string
  email: string | null
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export interface ChannelMemberDto {
  userId: string
  displayName: string
  email?: string | null
  avatarUrl: string | null
  role?: string
}

function fetchJson<T>(path: string, errorLabel: string) {
  return () => fetchApiJson<T>(path, errorLabel)
}

export function useWorkspaceChannels() {
  return useQuery<WorkspaceChannelDto[]>({
    queryKey: workspaceChannelsQueryKey,
    queryFn: () => fetchWorkspaceChannels<WorkspaceChannelDto[]>(),
  })
}

export function useWorkspaceDms() {
  return useQuery<DmChannelDto[]>({
    queryKey: workspaceDmsQueryKey,
    queryFn: () => fetchWorkspaceDms<DmChannelDto[]>(),
    enabled: FEATURE_FLAGS.dm,
  })
}

export function useWorkspaceMembers() {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: fetchJson('/api/workspaces/members?status=active', 'メンバー'),
  })
}

export function useChannelMembers(channelId: string | null, enabled: boolean) {
  return useQuery<ChannelMemberDto[]>({
    queryKey: ['channel-members', channelId],
    queryFn: fetchJson(`/api/channels/${channelId}/members`, 'チャンネルメンバー'),
    enabled: enabled && !!channelId,
  })
}

export function useProjectMembers(projectId: string | null) {
  return useQuery<ChannelMemberDto[]>({
    queryKey: ['project-members', projectId],
    queryFn: fetchJson(`/api/projects/${projectId}/members`, 'プロジェクトメンバー'),
    enabled: !!projectId,
  })
}

export function useCreateWorkspaceChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; isPrivate: boolean }) => {
      const res = await apiFetch('/api/workspaces/channels', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'チャンネルの作成に失敗しました')
      }
      return res.json() as Promise<WorkspaceChannelDto>
    },
    onSuccess: (channel) => {
      qc.setQueryData<WorkspaceChannelDto[]>(workspaceChannelsQueryKey, (current) => [
        ...(current ?? []),
        channel,
      ])
    },
  })
}

export function useRenameWorkspaceChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ channelId, name }: { channelId: string; name: string }) => {
      const res = await apiFetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? '名前の変更に失敗しました')
      }
      return res.json() as Promise<{ id: string; name: string }>
    },
    onSuccess: (updated) => {
      qc.setQueryData<WorkspaceChannelDto[]>(workspaceChannelsQueryKey, (current) =>
        current?.map((channel) => (channel.id === updated.id ? { ...channel, name: updated.name } : channel)),
      )
    },
  })
}

export function useDeleteWorkspaceChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiFetch(`/api/channels/${channelId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? '削除に失敗しました')
      }
    },
    onSuccess: (_result, channelId) => {
      qc.setQueryData<WorkspaceChannelDto[]>(workspaceChannelsQueryKey, (current) =>
        current?.filter((channel) => channel.id !== channelId && channel.parentChannelId !== channelId),
      )
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useCreateChannelThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ channelId, name }: { channelId: string; name: string }) => {
      const res = await apiFetch(`/api/channels/${channelId}/threads`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'スレッドの作成に失敗しました')
      }
      return res.json() as Promise<{ id: string }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceChannelsQueryKey })
    },
  })
}

export function usePatchProjectMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      milestoneId,
      completed,
    }: {
      projectId: string
      milestoneId: string
      completed: boolean
    }) => {
      const res = await apiFetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'マイルストーンの更新に失敗しました')
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectChannelsQueryKey })
    },
  })
}

export function useCreateWorkspaceDm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await apiFetch('/api/workspaces/dms', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'ダイレクトメッセージの開始に失敗しました')
      }
      return res.json() as Promise<{ id: string }>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceDmsQueryKey })
    },
  })
}
