import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api-fetch'

export interface ProjectDto {
  id: string
  title: string
  description: string | null
  statusName: 'plan' | 'review' | 'active' | 'done'
  startDate: string | null
  endDate: string | null
  memberCount: number
  memberNames: string[]
  taskCount: number
  completedTaskCount: number
  isOwner: boolean
  isMember: boolean
  archived: boolean
  coverPhotoIdx: number
  coverPhotoUrl: string | null
}

export interface ProjectChannelDto {
  channelId: string
  channelName: string
  projectId: string
  projectTitle: string
  unreadCount: number
  unreadMentionCount: number
}

export interface WorkspaceChannelDto {
  id: string
  name: string | null
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

export function useProjects() {
  return useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiFetch('/api/projects')
      if (!res.ok) throw new Error(`プロジェクトの取得に失敗しました (${res.status})`)
      return res.json() as Promise<ProjectDto[]>
    },
  })
}

export function useProjectChannels() {
  return useQuery<ProjectChannelDto[]>({
    queryKey: ['project-channels'],
    queryFn: async () => {
      const res = await apiFetch('/api/projects/channels')
      if (!res.ok) throw new Error(`チャンネルの取得に失敗しました (${res.status})`)
      return res.json() as Promise<ProjectChannelDto[]>
    },
  })
}

export function useWorkspaceChannels() {
  return useQuery<WorkspaceChannelDto[]>({
    queryKey: ['workspace-channels'],
    queryFn: async () => {
      const res = await apiFetch('/api/workspaces/channels')
      if (!res.ok) throw new Error(`チャンネルの取得に失敗しました (${res.status})`)
      return res.json() as Promise<WorkspaceChannelDto[]>
    },
  })
}

export function useDms() {
  return useQuery<DmChannelDto[]>({
    queryKey: ['dms'],
    queryFn: async () => {
      const res = await apiFetch('/api/workspaces/dms')
      if (!res.ok) throw new Error(`ダイレクトメッセージの取得に失敗しました (${res.status})`)
      return res.json() as Promise<DmChannelDto[]>
    },
  })
}

// API はエラー本文を { error: string | ... } で返すため、文字列のときだけ拾う
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

export function useCreateWorkspaceChannel() {
  const qc = useQueryClient()
  return useMutation<WorkspaceChannelDto, Error, { name: string; isPrivate: boolean }>({
    mutationFn: async ({ name, isPrivate }) => {
      const res = await apiFetch('/api/workspaces/channels', {
        method: 'POST',
        body: JSON.stringify({ name, isPrivate }),
      })
      if (!res.ok) throw new Error(await readErrorMessage(res, 'チャンネルの作成に失敗しました'))
      return res.json() as Promise<WorkspaceChannelDto>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-channels'] }),
  })
}

export function useCreateDm() {
  const qc = useQueryClient()
  return useMutation<{ id: string }, Error, { targetUserId: string }>({
    mutationFn: async ({ targetUserId }) => {
      const res = await apiFetch('/api/workspaces/dms', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      })
      if (!res.ok) throw new Error(await readErrorMessage(res, 'ダイレクトメッセージの作成に失敗しました'))
      return res.json() as Promise<{ id: string }>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dms'] }),
  })
}
