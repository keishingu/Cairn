import { useQuery } from '@tanstack/react-query'
import { fetchProjectChannels, projectChannelsQueryKey } from '../lib/channel-list-queries'
import { fetchApiJson } from '../lib/fetch-api-json'
import { useT } from '../components/locale-provider'

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
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
  archived: boolean
  unreadCount: number
  unreadMentionCount: number
  milestoneId: string | null
  milestoneCompleted: boolean | null
}

export function useProjects() {
  const t = useT()
  return useQuery<ProjectDto[]>({
    queryKey: ['projects'],
    queryFn: () => fetchApiJson<ProjectDto[]>('/api/projects', t('Could not load projects ({status})')),
  })
}

export function useProjectChannels() {
  const t = useT()
  return useQuery<ProjectChannelDto[]>({
    queryKey: projectChannelsQueryKey,
    queryFn: () => fetchProjectChannels<ProjectChannelDto[]>(t),
  })
}
