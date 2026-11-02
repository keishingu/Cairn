import { useQuery } from '@tanstack/react-query'
import { fetchApiJson } from '../lib/fetch-api-json'
import { useT } from '../components/locale-provider'

export interface ChatInfoTaskDto {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
}

export interface ChatInfoFileDto {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  fileType: string
  createdAt: string
  externalUrl?: string
}

export function useChatInfoTasks(scope: { projectId: string } | { channelId: string } | null) {
  const t = useT()
  const search = scope
    ? 'projectId' in scope
      ? `projectId=${scope.projectId}`
      : `channelId=${scope.channelId}`
    : null
  return useQuery<ChatInfoTaskDto[]>({
    queryKey: ['tasks', 'chat-info', search],
    queryFn: () => fetchApiJson<ChatInfoTaskDto[]>(`/api/tasks?${search}`, t('Could not load tasks ({status})')),
    enabled: !!search,
  })
}

export function useChatInfoFiles(channelId: string | null) {
  const t = useT()
  return useQuery<ChatInfoFileDto[]>({
    queryKey: ['channel-files', channelId],
    queryFn: () => fetchApiJson<ChatInfoFileDto[]>(`/api/channels/${channelId}/files`, t('Could not load files ({status})')),
    enabled: !!channelId,
  })
}
