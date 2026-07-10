import { useQuery } from '@tanstack/react-query'
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
  archived: boolean
  unreadCount: number
  unreadMentionCount: number
  milestoneId: string | null
  milestoneCompleted: boolean | null
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
