import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@cairn/shared'
import { apiFetch } from '../lib/api-fetch'

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
}

function fetchJson<T>(path: string, errorLabel: string) {
  return async (): Promise<T> => {
    const res = await apiFetch(path)
    if (!res.ok) throw new Error(`${errorLabel}の取得に失敗しました (${res.status})`)
    return res.json() as Promise<T>
  }
}

export function useWorkspaceChannels() {
  return useQuery<WorkspaceChannelDto[]>({
    queryKey: ['workspace-channels'],
    queryFn: fetchJson('/api/workspaces/channels', 'チャンネル'),
  })
}

export function useWorkspaceDms() {
  return useQuery<DmChannelDto[]>({
    queryKey: ['workspace-dms'],
    queryFn: fetchJson('/api/workspaces/dms', 'ダイレクトメッセージ'),
    enabled: FEATURE_FLAGS.dm,
  })
}

export function useWorkspaceMembers() {
  return useQuery<WorkspaceMemberDto[]>({
    queryKey: ['workspace-members'],
    queryFn: fetchJson('/api/workspaces/members?status=active', 'メンバー'),
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
      qc.setQueryData<WorkspaceChannelDto[]>(['workspace-channels'], (current) => [
        ...(current ?? []),
        channel,
      ])
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
      void qc.invalidateQueries({ queryKey: ['workspace-dms'] })
    },
  })
}
